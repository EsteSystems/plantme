import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";

import searchRoutes from "./routes/search.js";
import plantRoutes from "./routes/plants.js";
import conditionRoutes from "./routes/conditions.js";
import systemRoutes from "./routes/systems.js";
import traditionRoutes from "./routes/traditions.js";
import substanceRoutes from "./routes/substances.js";
import graphRoutes from "./routes/graph.js";

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86400,
}));

// ── Routes ───────────────────────────────────────────────────────────────────

app.route("/api/search", searchRoutes);
app.route("/api/plants", plantRoutes);
app.route("/api/conditions", conditionRoutes);
app.route("/api/systems", systemRoutes);
app.route("/api/traditions", traditionRoutes);
app.route("/api/substances", substanceRoutes);
app.route("/api/graph", graphRoutes);

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({ status: "ok", version: "0.1.0" });
});

// ── 404 fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// ── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("API Error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
