import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_SECRET: z.string().min(24, "JWT_SECRET must be at least 24 characters"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  REDIS_URL: z.string().url().optional(),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(10000)
});

export const env = envSchema.parse(process.env);
