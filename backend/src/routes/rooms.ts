import { Router } from "express";
import { z } from "zod";
import { initialSnapshotForLanguage, isSupportedLanguage, type SupportedLanguage } from "../config/languages.js";
import { query } from "../db/pool.js";
import { createRoomSlug } from "../lib/ids.js";
import { getIO } from "../lib/io-instance.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  language: z.string().trim().min(2).max(32).default("typescript")
}).refine((input) => isSupportedLanguage(input.language), {
  message: "Unsupported language",
  path: ["language"]
});

const joinRoomSchema = z.object({
  role: z.enum(["editor", "viewer"]).default("editor")
});

const createFileSchema = z.object({
  path: z.string().trim().min(1).max(255).regex(/^[^\0]+$/, "Invalid path"),
  language: z.string().trim().min(2).max(32).default("typescript")
}).refine((input) => isSupportedLanguage(input.language), {
  message: "Unsupported language",
  path: ["language"]
});

const renameFileSchema = z.object({
  path: z.string().trim().min(1).max(255).regex(/^[^\0]+$/, "Invalid path")
});

const updateMarkSchema = z.object({
  marks: z.coerce.number().int().min(0).max(100),
  feedback: z.string().trim().max(1000).default("")
});

type RoomRole = "owner" | "editor" | "viewer";

type RoomRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  role: RoomRole;
  document_id: string;
  language: string;
  snapshot: string;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  path: string;
  language: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type RoomMemberRow = {
  user_id: string;
  name: string;
  email: string;
  role: RoomRole;
  marks: number;
  feedback: string;
  marked_by: string | null;
  updated_at: string | null;
};

router.use(requireAuth);

// ─── Rooms ───────────────────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const result = await query<RoomRow>(
      `SELECT r.id, r.name, r.slug, r.owner_id, rm.role, d.id AS document_id, d.language,
              d.snapshot, r.created_at, r.updated_at
       FROM room_members rm
       JOIN rooms r ON r.id = rm.room_id
       JOIN documents d ON d.room_id = r.id
       WHERE rm.user_id = $1
       ORDER BY r.updated_at DESC`,
      [req.user?.id]
    );
    return res.json({ rooms: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createRoomSchema.parse(req.body);
    const slug = createRoomSlug();
    const language = input.language as SupportedLanguage;
    const snapshot = initialSnapshotForLanguage(language);

    const result = await query<RoomRow>(
      `WITH new_room AS (
         INSERT INTO rooms (owner_id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, owner_id, created_at, updated_at
       ),
       membership AS (
         INSERT INTO room_members (room_id, user_id, role)
         SELECT id, $1, 'owner'::room_role FROM new_room
       ),
       doc AS (
         INSERT INTO documents (room_id, title, path, language, snapshot)
         SELECT id, name, 'main', $4, $5 FROM new_room
         RETURNING id, room_id, language, snapshot
       )
       SELECT new_room.id, new_room.name, new_room.slug, new_room.owner_id,
              'owner'::room_role AS role, doc.id AS document_id, doc.language,
              doc.snapshot, new_room.created_at, new_room.updated_at
       FROM new_room
       JOIN doc ON doc.room_id = new_room.id`,
      [req.user?.id, input.name, slug, language, snapshot]
    );

    return res.status(201).json({ room: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid room data", details: error.flatten() });
    }
    return next(error);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const result = await query<RoomRow>(
      `SELECT r.id, r.name, r.slug, r.owner_id, rm.role, d.id AS document_id, d.language,
              d.snapshot, r.created_at, r.updated_at
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
       JOIN documents d ON d.room_id = r.id
       WHERE r.slug = $2
       ORDER BY d.created_at ASC
       LIMIT 1`,
      [req.user?.id, req.params.slug]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Room not found or not joined" });
    }
    return res.json({ room: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/:slug/join", async (req, res, next) => {
  try {
    const input = joinRoomSchema.parse(req.body);
    const result = await query<RoomRow>(
      `WITH target AS (
         SELECT id FROM rooms WHERE slug = $1
       ),
       membership AS (
         INSERT INTO room_members (room_id, user_id, role)
         SELECT id, $2, $3::room_role FROM target
         ON CONFLICT (room_id, user_id) DO UPDATE SET role = room_members.role
         RETURNING room_id, role
       )
       SELECT r.id, r.name, r.slug, r.owner_id, membership.role, d.id AS document_id,
              d.language, d.snapshot, r.created_at, r.updated_at
       FROM membership
       JOIN rooms r ON r.id = membership.room_id
       JOIN documents d ON d.room_id = r.id
       ORDER BY d.created_at ASC
       LIMIT 1`,
      [req.params.slug, req.user?.id, input.role]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Room not found" });
    }
    return res.json({ room: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid join data", details: error.flatten() });
    }
    return next(error);
  }
});

router.patch("/:slug", async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const result = await query<RoomRow>(
      `UPDATE rooms r
       SET name = $3, updated_at = NOW()
       FROM room_members rm
       WHERE r.id = rm.room_id AND r.slug = $1 AND rm.user_id = $2 AND rm.role = 'owner'
       RETURNING r.id, r.name, r.slug, r.owner_id, rm.role, r.created_at, r.updated_at,
                 (SELECT id FROM documents WHERE room_id = r.id ORDER BY created_at ASC LIMIT 1) AS document_id,
                 (SELECT language FROM documents WHERE room_id = r.id ORDER BY created_at ASC LIMIT 1) AS language,
                 (SELECT snapshot FROM documents WHERE room_id = r.id ORDER BY created_at ASC LIMIT 1) AS snapshot`,
      [req.params.slug, req.user?.id, input.name]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "Only the room owner can rename this room" });
    }
    return res.json({ room: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid room data", details: error.flatten() });
    }
    return next(error);
  }
});

router.delete("/:slug", async (req, res, next) => {
  try {
    const result = await query<{ id: string }>(
      `DELETE FROM rooms r
       USING room_members rm
       WHERE r.id = rm.room_id AND r.slug = $1 AND rm.user_id = $2 AND rm.role = 'owner'
       RETURNING r.id`,
      [req.params.slug, req.user?.id]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "Only the room owner can delete this room" });
    }
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

// ─── Members and marks ────────────────────────────────────────────────────────

router.get("/:slug/members", async (req, res, next) => {
  try {
    const result = await query<RoomMemberRow>(
      `SELECT u.id AS user_id, u.name, u.email, rm.role,
              COALESCE(m.marks, 0) AS marks,
              COALESCE(m.feedback, '') AS feedback,
              m.marked_by,
              m.updated_at
       FROM rooms r
       JOIN room_members requester ON requester.room_id = r.id AND requester.user_id = $1
       JOIN room_members rm ON rm.room_id = r.id
       JOIN users u ON u.id = rm.user_id
       LEFT JOIN room_member_marks m ON m.room_id = r.id AND m.user_id = u.id
       WHERE r.slug = $2
       ORDER BY
         CASE rm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
         u.name ASC`,
      [req.user?.id, req.params.slug]
    );

    return res.json({ members: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.put("/:slug/members/:userId/marks", async (req, res, next) => {
  try {
    const input = updateMarkSchema.parse(req.body);
    const result = await query<RoomMemberRow>(
      `WITH room_check AS (
         SELECT r.id
         FROM rooms r
         JOIN room_members requester ON requester.room_id = r.id
           AND requester.user_id = $1
           AND requester.role IN ('owner', 'editor')
         JOIN room_members target ON target.room_id = r.id AND target.user_id = $3
         WHERE r.slug = $2
       ),
       upserted AS (
         INSERT INTO room_member_marks (room_id, user_id, marked_by, marks, feedback, updated_at)
         SELECT id, $3, $1, $4, $5, NOW() FROM room_check
         ON CONFLICT (room_id, user_id)
         DO UPDATE SET marks = EXCLUDED.marks,
                       feedback = EXCLUDED.feedback,
                       marked_by = EXCLUDED.marked_by,
                       updated_at = NOW()
         RETURNING room_id, user_id, marks, feedback, marked_by, updated_at
       )
       SELECT u.id AS user_id, u.name, u.email, rm.role,
              upserted.marks, upserted.feedback, upserted.marked_by, upserted.updated_at
       FROM upserted
       JOIN room_members rm ON rm.room_id = upserted.room_id AND rm.user_id = upserted.user_id
       JOIN users u ON u.id = upserted.user_id`,
      [req.user?.id, req.params.slug, req.params.userId, input.marks, input.feedback]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "Member not found or permission denied" });
    }

    getIO()?.to(`room:${req.params.slug}`).emit("members:changed", { slug: req.params.slug });
    return res.json({ member: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid marks data", details: error.flatten() });
    }
    return next(error);
  }
});

// ─── Files (per-room documents) ───────────────────────────────────────────────

router.get("/:slug/files", async (req, res, next) => {
  try {
    const result = await query<FileRow>(
      `SELECT d.id, d.path, d.language, d.title, d.created_at, d.updated_at
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
       JOIN documents d ON d.room_id = r.id
       WHERE r.slug = $2
       ORDER BY d.path ASC`,
      [req.user?.id, req.params.slug]
    );
    return res.json({ files: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/:slug/files", async (req, res, next) => {
  try {
    const input = createFileSchema.parse(req.body);
    const language = input.language as SupportedLanguage;
    const snapshot = initialSnapshotForLanguage(language);
    const title = input.path.split("/").pop() ?? input.path;

    const result = await query<FileRow>(
      `WITH room_check AS (
         SELECT r.id FROM rooms r
         JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
           AND rm.role IN ('owner', 'editor')
         WHERE r.slug = $2
       )
       INSERT INTO documents (room_id, path, title, language, snapshot)
       SELECT id, $3, $4, $5, $6 FROM room_check
       RETURNING id, path, language, title, created_at, updated_at`,
      [req.user?.id, req.params.slug, input.path, title, language, snapshot]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "You don't have permission to create files in this room" });
    }

    // Notify all connected users in this room
    getIO()?.to(`room:${req.params.slug}`).emit("files:changed", { slug: req.params.slug });

    return res.status(201).json({ file: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid file data", details: error.flatten() });
    }
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "A file with that path already exists" });
    }
    return next(error);
  }
});

router.patch("/:slug/files/:fileId", async (req, res, next) => {
  try {
    const input = renameFileSchema.parse(req.body);
    const title = input.path.split("/").pop() ?? input.path;

    const result = await query<FileRow>(
      `UPDATE documents d
       SET path = $4, title = $5, updated_at = NOW()
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
         AND rm.role IN ('owner', 'editor')
       WHERE r.slug = $2 AND d.id = $3 AND d.room_id = r.id
       RETURNING d.id, d.path, d.language, d.title, d.created_at, d.updated_at`,
      [req.user?.id, req.params.slug, req.params.fileId, input.path, title]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "File not found or permission denied" });
    }

    getIO()?.to(`room:${req.params.slug}`).emit("files:changed", { slug: req.params.slug });
    return res.json({ file: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid file data", details: error.flatten() });
    }
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "A file with that path already exists" });
    }
    return next(error);
  }
});

router.delete("/:slug/files/:fileId", async (req, res, next) => {
  try {
    // Prevent deleting the last file in a room
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM documents d
       JOIN rooms r ON r.id = d.room_id
       WHERE r.slug = $1`,
      [req.params.slug]
    );
    if (parseInt(countResult.rows[0]?.count ?? "0") <= 1) {
      return res.status(400).json({ error: "Cannot delete the last file in a room" });
    }

    const result = await query<{ id: string }>(
      `DELETE FROM documents d
       USING rooms r
       JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
         AND rm.role IN ('owner', 'editor')
       WHERE r.slug = $2 AND d.id = $3 AND d.room_id = r.id
       RETURNING d.id`,
      [req.user?.id, req.params.slug, req.params.fileId]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: "File not found or permission denied" });
    }

    getIO()?.to(`room:${req.params.slug}`).emit("files:changed", { slug: req.params.slug });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export { router as roomsRouter };
