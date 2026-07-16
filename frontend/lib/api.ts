import { getToken } from "@/lib/auth";

export type RoomRole = "owner" | "editor" | "viewer";

export type Room = {
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

export type RoomFile = {
  id: string;
  path: string;
  language: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type RoomMember = {
  user_id: string;
  name: string;
  email: string;
  role: RoomRole;
  marks: number;
  feedback: string;
  marked_by: string | null;
  updated_at: string | null;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  language: string;
  version: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init: RequestInit = {}) {
  const token = getToken();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function listRooms() {
  return request<{ rooms: Room[] }>("/api/rooms");
}

export function createRoom(input: { name: string; language: string }) {
  return request<{ room: Room }>("/api/rooms", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getRoom(slug: string) {
  return request<{ room: Room }>(`/api/rooms/${slug}`);
}

export function joinRoom(slug: string, role: "editor" | "viewer" = "editor") {
  return request<{ room: Room }>(`/api/rooms/${slug}/join`, {
    method: "POST",
    body: JSON.stringify({ role })
  });
}

export function listMembers(slug: string) {
  return request<{ members: RoomMember[] }>(`/api/rooms/${slug}/members`);
}

export function updateMemberMarks(slug: string, userId: string, input: { marks: number; feedback: string }) {
  return request<{ member: RoomMember }>(`/api/rooms/${slug}/members/${userId}/marks`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

// ─── Files ────────────────────────────────────────────────────────────────────

export function listFiles(slug: string) {
  return request<{ files: RoomFile[] }>(`/api/rooms/${slug}/files`);
}

export function createFile(slug: string, input: { path: string; language: string }) {
  return request<{ file: RoomFile }>(`/api/rooms/${slug}/files`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function renameFile(slug: string, fileId: string, path: string) {
  return request<{ file: RoomFile }>(`/api/rooms/${slug}/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ path })
  });
}

export function deleteFile(slug: string, fileId: string) {
  return request<undefined>(`/api/rooms/${slug}/files/${fileId}`, {
    method: "DELETE"
  });
}

export function executeCode(input: { language: string; source: string; fileName?: string }) {
  return request<RunResult>("/api/run", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
