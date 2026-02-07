import { Hono } from "hono";
import type { Env, GraphData, GraphNode, GraphEdge } from "../types.js";
import { getAllSynergies, getPlantBySlug, getPlantEgoNetwork } from "../db/queries.js";

const app = new Hono<{ Bindings: Env }>();

// GET /api/graph/synergies — Full synergy graph for D3
app.get("/synergies", async (c) => {
  const result = await getAllSynergies(c.env.DB);
  const rows = result.results || [];

  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    const slugA = row.slug_a as string;
    const slugB = row.slug_b as string;

    if (!nodesMap.has(slugA)) {
      nodesMap.set(slugA, {
        id: slugA,
        label: row.name_a as string,
        type: "plant",
        group: "plant",
        size: 0,
        meta: { scientific: (row.sci_a as string) || "" },
      });
    }
    if (!nodesMap.has(slugB)) {
      nodesMap.set(slugB, {
        id: slugB,
        label: row.name_b as string,
        type: "plant",
        group: "plant",
        size: 0,
        meta: { scientific: (row.sci_b as string) || "" },
      });
    }

    // Increment sizes (degree)
    nodesMap.get(slugA)!.size++;
    nodesMap.get(slugB)!.size++;

    edges.push({
      source: slugA,
      target: slugB,
      type: "synergy",
      label: (row.effect as string) || undefined,
      weight: 1,
    });
  }

  const graph: GraphData = {
    nodes: Array.from(nodesMap.values()),
    edges,
  };

  return c.json(graph);
});

// GET /api/graph/plant/:slug — Ego-network for a single plant
app.get("/plant/:slug", async (c) => {
  const slug = c.req.param("slug");
  const plant = await getPlantBySlug(c.env.DB, slug);

  if (!plant) {
    return c.json({ error: "Plant not found" }, 404);
  }

  const network = await getPlantEgoNetwork(c.env.DB, plant.id);

  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Center node
  nodesMap.set(plant.slug, {
    id: plant.slug,
    label: plant.name,
    type: "plant",
    group: "center",
    size: 0,
    meta: { scientific: plant.scientific || "" },
  });

  // Synergy nodes + edges
  for (const syn of network.synergies.results || []) {
    const s = syn as Record<string, unknown>;
    const synSlug = s.slug as string;
    if (!nodesMap.has(synSlug)) {
      nodesMap.set(synSlug, {
        id: synSlug,
        label: s.name as string,
        type: "plant",
        group: "synergy",
        size: 1,
        meta: { scientific: (s.scientific as string) || "" },
      });
    }
    nodesMap.get(plant.slug)!.size++;
    edges.push({
      source: plant.slug,
      target: synSlug,
      type: "synergy",
      label: (s.effect as string) || undefined,
      weight: 2,
    });
  }

  // Condition nodes + edges
  for (const cond of network.conditions.results || []) {
    const condSlug = `cond-${cond.slug}`;
    if (!nodesMap.has(condSlug)) {
      nodesMap.set(condSlug, {
        id: condSlug,
        label: cond.name,
        type: "condition",
        group: cond.system,
        size: 1,
        meta: {},
      });
    }
    edges.push({
      source: plant.slug,
      target: condSlug,
      type: "treats",
      weight: 1,
    });
  }

  // Tradition nodes + edges
  for (const trad of network.traditions.results || []) {
    const tradSlug = `trad-${trad.slug}`;
    if (!nodesMap.has(tradSlug)) {
      nodesMap.set(tradSlug, {
        id: tradSlug,
        label: trad.name,
        type: "tradition",
        group: "tradition",
        size: 1,
        meta: {},
      });
    }
    edges.push({
      source: plant.slug,
      target: tradSlug,
      type: "used_in",
      weight: 1,
    });
  }

  const graph: GraphData = {
    nodes: Array.from(nodesMap.values()),
    edges,
  };

  return c.json(graph);
});

export default app;
