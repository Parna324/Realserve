import { io, type Socket } from "socket.io-client";
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import type { RoomRole } from "@/lib/api";

type ProviderOptions = {
  slug: string;
  token: string;
  user: { name: string; color: string };
};

type JoinResponse =
  | { ok: true; role: RoomRole; state: string }
  | { ok: false; error: string };

const JOIN_TIMEOUT_MS = 10000;

function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }
  return "http://localhost:4000";
}

function toBase64(update: Uint8Array) {
  let binary = "";
  update.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(update: string) {
  const binary = atob(update);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * One SocketYjsProvider per room (not per file).
 * The same socket connection is reused when switching files via connect(fileId).
 */
export class SocketYjsProvider {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  role: RoomRole = "viewer";
  readonly socket: Socket;

  private slug: string;
  private user: { name: string; color: string };
  private currentFileId: string | null = null;

  // Tear-down handles so we can swap them on file switch
  private yjsDocHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private yjsSocketHandler: ((payload: { fileId: string; update: string }) => void) | null = null;
  private awarenessSocketHandler: ((payload: { update: string }) => void) | null = null;
  private awarenessLocalHandler: ((changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void) | null = null;

  constructor({ slug, token, user }: ProviderOptions) {
    this.slug = slug;
    this.user = user;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalStateField("user", user);

    this.socket = io(getWsUrl(), {
      auth: { token },
      transports: ["websocket", "polling"]
    });
  }

  /** Join or switch to a file. Safe to call multiple times. */
  async connect(fileId: string): Promise<JoinResponse> {
    // ── 1. Tear down previous file handlers ──────────────────────────────────
    if (this.yjsDocHandler) this.doc.off("update", this.yjsDocHandler);
    if (this.yjsSocketHandler) this.socket.off("yjs:update", this.yjsSocketHandler);
    if (this.awarenessSocketHandler) this.socket.off("awareness:update", this.awarenessSocketHandler);
    if (this.awarenessLocalHandler) this.awareness.off("update", this.awarenessLocalHandler);

    // ── 2. Send join or switch-file event ────────────────────────────────────
    let response: JoinResponse;

    if (this.currentFileId && this.currentFileId !== fileId) {
      // Already in this room — just switch file
      response = await new Promise<JoinResponse>((resolve) => {
        this.socket.timeout(JOIN_TIMEOUT_MS).emit(
          "room:switch-file",
          { slug: this.slug, oldFileId: this.currentFileId!, newFileId: fileId, user: this.user },
          (error: Error | null, ack?: JoinResponse) => {
            resolve(error ? { ok: false, error: "Timed out while switching files" } : ack ?? { ok: false, error: "Missing switch response" });
          }
        );
      });
    } else {
      // First connection or same file re-join
      response = await new Promise<JoinResponse>((resolve) => {
        this.socket.timeout(JOIN_TIMEOUT_MS).emit(
          "room:join",
          { slug: this.slug, fileId, user: this.user },
          (error: Error | null, ack?: JoinResponse) => {
            resolve(error ? { ok: false, error: "Timed out while joining the collaborative document" } : ack ?? { ok: false, error: "Missing join response" });
          }
        );
      });
    }

    if (!response.ok) return response;

    // ── 3. Reset Yjs doc for the new file ────────────────────────────────────
    this.doc.destroy();
    this.doc = new Y.Doc();

    // Rebuild awareness against the new doc
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.awareness.clientID], this);
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalStateField("user", this.user);

    this.currentFileId = fileId;
    this.role = response.role;

    // Seed doc with server state
    Y.applyUpdate(this.doc, fromBase64(response.state), this);

    // ── 4. Outgoing Yjs updates ───────────────────────────────────────────────
    this.yjsDocHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === this || this.role === "viewer") return;
      this.socket.emit("yjs:update", { slug: this.slug, fileId, update: toBase64(update) });
    };
    this.doc.on("update", this.yjsDocHandler);

    // ── 5. Incoming Yjs updates ──────────────────────────────────────────────
    this.yjsSocketHandler = ({ fileId: incomingId, update }: { fileId: string; update: string }) => {
      if (incomingId !== fileId) return;
      Y.applyUpdate(this.doc, fromBase64(update), this);
    };
    this.socket.on("yjs:update", this.yjsSocketHandler);

    // ── 6. Awareness ─────────────────────────────────────────────────────────
    this.awarenessLocalHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === this) return;
      const changed = [...added, ...updated, ...removed];
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
      this.socket.emit("awareness:update", { slug: this.slug, update: toBase64(update) });
    };
    this.awareness.on("update", this.awarenessLocalHandler);

    this.awarenessSocketHandler = ({ update }: { update: string }) => {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, fromBase64(update), this);
    };
    this.socket.on("awareness:update", this.awarenessSocketHandler);

    return response;
  }

  destroy() {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.awareness.clientID], this);
    this.awareness.destroy();
    this.socket.disconnect();
    this.doc.destroy();
  }
}
