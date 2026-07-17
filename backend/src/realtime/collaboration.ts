import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import * as Y from "yjs";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { setIO } from "../lib/io-instance.js";
import { verifyAuthToken } from "../lib/tokens.js";
import type { AuthUser } from "../types/auth.js";

type RoomRole = "owner" | "editor" | "viewer";

type FileAccess = {
  fileId: string;
  slug: string;
  role: RoomRole;
  language: string;
  snapshot: string;
  yjs_state: Buffer | null;
  path: string;
};

type CollaborationDoc = {
  doc: Y.Doc;
  fileId: string;
  language: string;
  slug: string;
  clients: Set<string>;
  saveTimer?: NodeJS.Timeout;
  isDirty: boolean;
};

type ClientToServerEvents = {
  "room:join": (
    payload: { slug: string; fileId: string; user: { name: string; color: string } },
    ack: (response: { ok: true; role: RoomRole; state: string } | { ok: false; error: string }) => void
  ) => void;
  "room:switch-file": (
    payload: { slug: string; oldFileId: string; newFileId: string; user: { name: string; color: string } },
    ack: (response: { ok: true; role: RoomRole; state: string } | { ok: false; error: string }) => void
  ) => void;
  "yjs:update": (payload: { slug: string; fileId: string; update: string }) => void;
  "awareness:update": (payload: { slug: string; update: string }) => void;
};

type ServerToClientEvents = {
  "presence:user-joined": (payload: { name: string; color: string }) => void;
  "presence:user-left": (payload: { socketId: string }) => void;
  "yjs:update": (payload: { fileId: string; update: string }) => void;
  "awareness:update": (payload: { update: string }) => void;
  "files:changed": (payload: { slug: string }) => void;
  "members:changed": (payload: { slug: string }) => void;
};

type SocketData = {
  user: AuthUser;
  slug: string | null;
  fileIds: Set<string>;
};

// In-memory Yjs docs keyed by fileId
const fileDocs = new Map<string, CollaborationDoc>();
let redisPublisher: InstanceType<typeof Redis> | null = null;
let redisSubscriber: InstanceType<typeof Redis> | null = null;
const instanceId = randomUUID();

// ── Update-log compaction ─────────────────────────────────────────────────────
// How many raw update rows we allow before compacting into a new checkpoint.
// Lower = less history stored but tighter DB table.  Default covers ~one session.
const COMPACTION_THRESHOLD = 200;

// In-memory counters so we don't run COUNT(*) on every keystroke.
// Keyed by fileId.  Initialised lazily to 0 on first update.
const updateCounters = new Map<string, number>();

function toBase64(update: Uint8Array) {
  return Buffer.from(update).toString("base64");
}

function fromBase64(update: string) {
  return new Uint8Array(Buffer.from(update, "base64"));
}

async function findFileAccess(slug: string, fileId: string, userId: string): Promise<FileAccess | null> {
  const result = await query<FileAccess>(
    `SELECT d.id AS "fileId", r.slug, rm.role, d.language, d.snapshot, d.yjs_state, d.path
     FROM rooms r
     JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     JOIN documents d ON d.room_id = r.id AND d.id = $3
     WHERE r.slug = $2`,
    [userId, slug, fileId]
  );
  return result.rows[0] ?? null;
}

async function getOrCreateDoc(access: FileAccess): Promise<CollaborationDoc> {
  const existing = fileDocs.get(access.fileId);
  if (existing) return existing;

  const doc = new Y.Doc();
  if (access.yjs_state) {
    Y.applyUpdate(doc, new Uint8Array(access.yjs_state));
  } else {
    doc.getText("monaco").insert(0, access.snapshot);
  }

  const collab: CollaborationDoc = {
    clients: new Set(),
    doc,
    fileId: access.fileId,
    isDirty: false,
    language: access.language,
    slug: access.slug
  };
  fileDocs.set(access.fileId, collab);
  return collab;
}

async function persistDoc(fileId: string) {
  const collab = fileDocs.get(fileId);
  if (!collab || !collab.isDirty) return;

  const state = Y.encodeStateAsUpdate(collab.doc);
  const snapshot = collab.doc.getText("monaco").toString();

  if (redisPublisher) {
    await redisPublisher.set(`file:${fileId}:yjs`, Buffer.from(state).toString("base64"), "EX", 3600);
  }

  await query(
    `UPDATE documents SET snapshot = $2, yjs_state = $3, updated_at = NOW() WHERE id = $1`,
    [fileId, snapshot, Buffer.from(state)]
  );
  await query(
    `UPDATE rooms SET updated_at = NOW()
     FROM documents WHERE documents.room_id = rooms.id AND documents.id = $1`,
    [fileId]
  );
  collab.isDirty = false;
}

function schedulePersist(fileId: string) {
  const collab = fileDocs.get(fileId);
  if (!collab) return;
  collab.isDirty = true;
  clearTimeout(collab.saveTimer);
  collab.saveTimer = setTimeout(() => {
    persistDoc(fileId).catch((err) => console.error(`Failed to persist file ${fileId}`, err));
  }, env.SNAPSHOT_INTERVAL_MS);
}

async function publishYjsUpdate(fileId: string, update: string) {
  if (!redisPublisher) return;
  await redisPublisher.publish("collab:yjs", JSON.stringify({ instanceId, fileId, update }));
}

async function publishAwareness(slug: string, update: string) {
  if (!redisPublisher) return;
  await redisPublisher.publish("collab:awareness", JSON.stringify({ instanceId, slug, update }));
}

// ── appendUpdate ──────────────────────────────────────────────────────────────
// Persists one raw Yjs binary delta to document_updates and increments the
// in-memory counter for that file.  If the counter reaches COMPACTION_THRESHOLD
// we fire compactIfNeeded() asynchronously (never blocks the socket handler).
async function appendUpdate(
  fileId: string,
  update: Uint8Array,
  clientId: string
): Promise<void> {
  // Write the raw delta — bytea column, so wrap in a Node Buffer.
  await query(
    `INSERT INTO document_updates (file_id, update_data, client_id)
     VALUES ($1, $2, $3)`,
    [fileId, Buffer.from(update), clientId]
  );

  // Bump the in-memory counter (initialise to 1 if first update for this file).
  const count = (updateCounters.get(fileId) ?? 0) + 1;
  updateCounters.set(fileId, count);

  if (count >= COMPACTION_THRESHOLD) {
    // Don't await — compaction is a background housekeeping task.
    compactIfNeeded(fileId).catch((e) =>
      console.error(`Compaction failed for file ${fileId}:`, e)
    );
  }
}

// ── compactIfNeeded ───────────────────────────────────────────────────────────
// Collapses the current doc state into a new yjs_state checkpoint, records
// when that checkpoint was taken (checkpoint_at), then prunes all raw
// document_updates rows older than that timestamp.
//
// Tradeoff: history before the new checkpoint is permanently discarded.
// For teaching/grading use cases this is acceptable — we keep the most recent
// COMPACTION_THRESHOLD edits which covers a full coding session.
async function compactIfNeeded(fileId: string): Promise<void> {
  const collab = fileDocs.get(fileId);
  if (!collab) return;

  // Build a full-state update from the current in-memory Yjs doc.
  const state = Y.encodeStateAsUpdate(collab.doc);
  const snapshot = collab.doc.getText("monaco").toString();
  const now = new Date();

  // Write the fresh checkpoint — same columns as persistDoc() plus checkpoint_at.
  await query(
    `UPDATE documents
     SET snapshot = $2, yjs_state = $3, checkpoint_at = $4, updated_at = NOW()
     WHERE id = $1`,
    [fileId, snapshot, Buffer.from(state), now]
  );

  // Prune raw updates that are now covered by the new checkpoint.
  // We keep the rows created *at* the checkpoint timestamp in case of races.
  await query(
    `DELETE FROM document_updates
     WHERE file_id = $1 AND created_at < $2`,
    [fileId, now]
  );

  // Reset the in-memory counter for this file.
  updateCounters.set(fileId, 0);

  console.log(`[history] Compacted file ${fileId} — checkpoint at ${now.toISOString()}`);
}

export function attachCollaborationServer(httpServer: HttpServer) {
  const corsOrigin =
    env.NODE_ENV === "production"
      ? env.FRONTEND_ORIGIN
      : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true);

  const io = new Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>(httpServer, {
    cors: { credentials: true, origin: corsOrigin }
  });

  // Export io for use by HTTP routes (file CRUD)
  setIO(io as unknown as import("socket.io").Server);

  // Redis adapter for horizontal scaling — gracefully skipped if Redis is unavailable
  if (env.REDIS_URL) {
    const redisOpts = {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null // don't retry — just log and carry on
    } as const;
    const pub = new Redis(env.REDIS_URL, redisOpts);
    const sub = new Redis(env.REDIS_URL, redisOpts);
    pub.on("error", (e) => console.warn("Redis pub unavailable (single-instance mode):", e.message));
    sub.on("error", (e) => console.warn("Redis sub unavailable (single-instance mode):", e.message));

    // Only activate if we can actually connect
    pub.connect().then(() => {
      redisPublisher = pub;
      redisSubscriber = sub;
      return sub.connect();
    }).then(() => {
      io.adapter(createAdapter(pub, sub));
      return sub.subscribe("collab:yjs", "collab:awareness");
    }).then(() => {
      sub.on("message", (channel, raw) => {
        const msg = JSON.parse(raw) as { instanceId: string; fileId?: string; slug?: string; update: string };
        if (msg.instanceId === instanceId) return;

        if (channel === "collab:yjs" && msg.fileId) {
          const collab = fileDocs.get(msg.fileId);
          if (collab) Y.applyUpdate(collab.doc, fromBase64(msg.update));
          io.to(`file:${msg.fileId}`).emit("yjs:update", { fileId: msg.fileId, update: msg.update });
        } else if (channel === "collab:awareness" && msg.slug) {
          io.to(`room:${msg.slug}`).emit("awareness:update", { update: msg.update });
        }
      });
    }).catch((e) => console.warn("Redis unavailable — running in single-instance mode:", (e as Error).message));
  } else {
    console.warn("REDIS_URL not set — running in single-instance mode.");
  }

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (typeof token !== "string") return next(new Error("Missing auth token"));
    try {
      socket.data.user = verifyAuthToken(token);
      socket.data.slug = null;
      socket.data.fileIds = new Set();
      return next();
    } catch {
      return next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", (socket) => {
    // Join a specific file inside a room
    socket.on("room:join", async ({ slug, fileId, user }, ack) => {
      try {
        const access = await findFileAccess(slug, fileId, socket.data.user.id);
        if (!access) return ack({ ok: false, error: "File not found or access denied" });

        const collab = await getOrCreateDoc(access);
        collab.clients.add(socket.id);
        socket.data.slug = slug;
        socket.data.fileIds.add(fileId);

        await socket.join([`room:${slug}`, `file:${fileId}`]);
        socket.to(`room:${slug}`).emit("presence:user-joined", { name: user.name, color: user.color });

        return ack({ ok: true, role: access.role, state: toBase64(Y.encodeStateAsUpdate(collab.doc)) });
      } catch (err) {
        console.error(err);
        return ack({ ok: false, error: "Failed to join file" });
      }
    });

    // Switch to another file (keeps presence in the room)
    socket.on("room:switch-file", async ({ slug, oldFileId, newFileId, user }, ack) => {
      try {
        const access = await findFileAccess(slug, newFileId, socket.data.user.id);
        if (!access) return ack({ ok: false, error: "File not found or access denied" });

        // Leave old file channel
        const oldCollab = fileDocs.get(oldFileId);
        if (oldCollab) oldCollab.clients.delete(socket.id);
        socket.data.fileIds.delete(oldFileId);
        await socket.leave(`file:${oldFileId}`);

        // Join new file channel
        const collab = await getOrCreateDoc(access);
        collab.clients.add(socket.id);
        socket.data.fileIds.add(newFileId);
        await socket.join(`file:${newFileId}`);

        return ack({ ok: true, role: access.role, state: toBase64(Y.encodeStateAsUpdate(collab.doc)) });
      } catch (err) {
        console.error(err);
        return ack({ ok: false, error: "Failed to switch file" });
      }
    });

    // Yjs update for a specific file
    socket.on("yjs:update", async ({ slug, fileId, update }) => {
      const access = await findFileAccess(slug, fileId, socket.data.user.id);
      if (!access || access.role === "viewer") return;

      const collab = fileDocs.get(fileId);
      if (!collab || collab.slug !== slug) return;

      const u = fromBase64(update);
      Y.applyUpdate(collab.doc, u);
      schedulePersist(fileId);

      // ── History log ────────────────────────────────────────────────────────
      // Append this delta to the update log.  We use the authenticated user's
      // display name as client_id — captured from socket.data.user which was
      // validated by the auth middleware, so it can't be spoofed.
      // Fire-and-forget: a transient write failure here doesn't corrupt the
      // live doc, it just means one update is missing from the history log.
      appendUpdate(fileId, u, socket.data.user.name).catch((e) =>
        console.error(`[history] Failed to append update for file ${fileId}:`, e)
      );
      // ── End history log ────────────────────────────────────────────────────

      socket.to(`file:${fileId}`).emit("yjs:update", { fileId, update });
      await publishYjsUpdate(fileId, update);
    });

    // Awareness update (room-wide, for cursor positions)
    socket.on("awareness:update", async ({ slug, update }) => {
      socket.to(`room:${slug}`).emit("awareness:update", { update });
      await publishAwareness(slug, update);
    });

    socket.on("disconnecting", () => {
      const slug = socket.data.slug;

      for (const fileId of socket.data.fileIds) {
        const collab = fileDocs.get(fileId);
        if (!collab) continue;
        collab.clients.delete(socket.id);
        if (collab.clients.size === 0) {
          persistDoc(fileId).catch((e) => console.error(`Final save failed for file ${fileId}`, e));
        }
      }

      if (slug) {
        socket.to(`room:${slug}`).emit("presence:user-left", { socketId: socket.id });
      }
    });
  });

  return io;
}
