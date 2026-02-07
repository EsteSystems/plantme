import { Hono } from "hono";
import type { Env } from "../types.js";
import { search } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const q = c.req.query("q");
  if (!q || q.trim().length === 0) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  const type = c.req.query("type"); // plant, condition, substance, tradition
  const results = await search(c.env.DB, q.trim(), type);
  return c.json({ results: results.results });
});

export default app;
