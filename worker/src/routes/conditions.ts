import { Hono } from "hono";
import type { Env } from "../types.js";
import { getConditionBySlug, getConditionPlants } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/conditions/:slug
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const condition = await getConditionBySlug(c.env.DB, slug);

  if (!condition) {
    return c.json({ error: "Condition not found" }, 404);
  }

  const plants = await getConditionPlants(c.env.DB, condition.id);

  return c.json({
    ...condition,
    plants: plants.results || [],
  });
});

export default app;
