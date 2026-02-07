import { Hono } from "hono";
import type { Env } from "../types.js";
import { getAllTraditions, getTraditionBySlug, getTraditionPlants } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/traditions
app.get("/", async (c) => {
  const traditions = await getAllTraditions(c.env.DB);
  return c.json({ traditions: traditions.results || [] });
});

// GET /api/traditions/:slug
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tradition = await getTraditionBySlug(c.env.DB, slug);

  if (!tradition) {
    return c.json({ error: "Tradition not found" }, 404);
  }

  const plants = await getTraditionPlants(c.env.DB, tradition.id);

  return c.json({
    ...tradition,
    plants: plants.results || [],
  });
});

export default app;
