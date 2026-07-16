import { Router } from "express";
import { query } from "../db/pool.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    await query("SELECT 1");
    return res.json({ ok: true, services: { api: "up", postgres: "up" } });
  } catch (error) {
    return next(error);
  }
});

export { router as healthRouter };
