import { Hono } from "hono";
import type { Env } from "../types.js";
import { getAllSystems } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/systems
app.get("/", async (c) => {
  const result = await getAllSystems(c.env.DB);
  return c.json({ systems: result.results || [] });
});

export default app;
