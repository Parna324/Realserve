import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { signAuthToken } from "../lib/tokens.js";
import { query } from "../db/pool.js";
import type { AuthUser } from "../types/auth.js";

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1)
});

type UserRow = AuthUser & {
  password_hash: string;
};

router.post("/signup", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const result = await query<AuthUser>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [input.name, input.email, passwordHash]
    );

    const user = result.rows[0];
    return res.status(201).json({ token: signAuthToken(user), user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid signup data", details: error.flatten() });
    }

    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await query<UserRow>(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [input.email]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const safeUser = { id: user.id, name: user.name, email: user.email };
    return res.json({ token: signAuthToken(safeUser), user: safeUser });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid login data", details: error.flatten() });
    }

    return next(error);
  }
});

export { router as authRouter };
