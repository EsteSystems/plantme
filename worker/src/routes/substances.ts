import { Hono } from "hono";
import type { Env } from "../types.js";
import { getSubstanceBySlug, getSubstancePlants } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/substances/:slug
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const substance = await getSubstanceBySlug(c.env.DB, slug);

  if (!substance) {
    return c.json({ error: "Substance not found" }, 404);
  }

  const plants = await getSubstancePlants(c.env.DB, substance.id);

  return c.json({
    ...substance,
    plants: plants.results || [],
  });
});

export default app;
