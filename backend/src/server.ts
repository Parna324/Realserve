import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import morgan from "morgan";
import { env } from "./config/env.js";

// In development allow any origin so LAN peers can connect.
// In production FRONTEND_ORIGIN is enforced explicitly.
const corsOrigin =
  env.NODE_ENV === "production"
    ? env.FRONTEND_ORIGIN
    : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true);
import { attachCollaborationServer } from "./realtime/collaboration.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { runRouter } from "./routes/run.js";
import { roomsRouter } from "./routes/rooms.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: corsOrigin
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/me", meRouter);
app.use("/api/run", runRouter);
app.use("/api/rooms", roomsRouter);

function getServiceError(error: unknown) {
  const code = (error as { code?: string }).code;

  if (code === "42P01" || code === "42703") {
    return {
      status: 503,
      message: "Database schema is not ready. Run npm run db:migrate."
    };
  }

  if (code === "3D000") {
    return {
      status: 503,
      message: "Database does not exist. Start the configured Postgres database."
    };
  }

  if (code === "28P01") {
    return {
      status: 503,
      message: "Database authentication failed. Check DATABASE_URL."
    };
  }

  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "ECONNRESET" || code === "57P01") {
    return {
      status: 503,
      message: "Database is unavailable. Start Postgres and try again."
    };
  }

  return null;
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const serviceError = getServiceError(err);

  if (serviceError) {
    return res.status(serviceError.status).json({ error: serviceError.message });
  }

  return res.status(500).json({ error: "Internal server error" });
});

const httpServer = createServer(app);
attachCollaborationServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
