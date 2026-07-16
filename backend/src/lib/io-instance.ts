import type { Server } from "socket.io";

// Singleton io instance shared between the HTTP routes and the WS server.
// Set once in collaboration.ts; read in rooms.ts to broadcast file-list changes.
let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}
