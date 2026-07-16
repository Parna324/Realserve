import crypto from "node:crypto";

export function createRoomSlug() {
  return crypto.randomBytes(5).toString("base64url");
}
