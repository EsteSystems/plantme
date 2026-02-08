import { Hono } from "hono";
import type { Env, PlantDetail } from "../types.js";
import {
  getAllPlants, getPlantBySlug, getPlantConditions,
  getPlantTraditions, getPlantPreparations, getPlantSubstances,
  getPlantCautions, getPlantSynergies,
} from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/plants
app.get("/", async (c) => {
  const tradition = c.req.query("tradition");
  const system = c.req.query("system");
  const limit = parseInt(c.req.query("limit") || "200");
  const offset = parseInt(c.req.query("offset") || "0");

  const result = await getAllPlants(c.env.DB, { tradition, system, limit, offset });

  const plants = (result.results || []).map((p) => ({
    ...p,
    alt_names: p.alt_names ? JSON.parse(p.alt_names) : [],
  }));

  return c.json({ plants });
});

// GET /api/plants/:slug
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const plant = await getPlantBySlug(c.env.DB, slug);

  if (!plant) {
    return c.json({ error: "Plant not found" }, 404);
  }

  const [conditions, traditions, preparations, substances, cautions, synergies] =
    await Promise.all([
      getPlantConditions(c.env.DB, plant.id),
      getPlantTraditions(c.env.DB, plant.id),
      getPlantPreparations(c.env.DB, plant.id),
      getPlantSubstances(c.env.DB, plant.id),
      getPlantCautions(c.env.DB, plant.id),
      getPlantSynergies(c.env.DB, plant.id),
    ]);

  const detail: PlantDetail = {
    ...plant,
    alt_names: plant.alt_names ? JSON.parse(plant.alt_names) : [],
    conditions: conditions.results || [],
    traditions: traditions.results || [],
    preparations: preparations.results || [],
    substances: (substances.results || []).map((s: any) => ({
      ...s,
      refs: s.refs ? JSON.parse(s.refs) : null,
    })),
    cautions: (cautions.results || []).map((c: any) => ({
      ...c,
      refs: c.refs ? JSON.parse(c.refs) : null,
    })),
    synergies: (synergies.results || []).map((s: any) => ({
      ...s,
      refs: s.refs ? JSON.parse(s.refs) : null,
    })),
  };

  return c.json(detail);
});

export default app;
