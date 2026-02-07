# PlantMe — Development Plan

## Overview

This plan tracks the implementation of PlantMe from the AsciiDoc compendium through to a fully deployed, interactive web application. Each milestone builds on the previous one, with tasks marked complete as they are implemented.

---

## Milestone 1: Project Scaffolding & Monorepo Setup ✅

| # | Task | Status |
|---|------|--------|
| 1.1 | Create root `package.json` with npm workspaces (`pipeline`, `worker`, `web`) | ✅ Done |
| 1.2 | Create `.gitignore` (node_modules, dist, .wrangler, seed.json, .env) | ✅ Done |
| 1.3 | Create root `tsconfig.json` base config | ✅ Done |
| 1.4 | Create `README.md` with project overview and setup instructions | ✅ Done |

---

## Milestone 2: Data Pipeline — Parse Compendium ✅

Transform the AsciiDoc compendium into structured, validated JSON.

| # | Task | Status |
|---|------|--------|
| 2.1 | Scaffold `pipeline/` workspace (package.json, tsconfig.json) | ✅ Done |
| 2.2 | Create JSON Schema for seed data (`pipeline/schema.json`) | ✅ Done |
| 2.3 | Build AsciiDoc parser (`pipeline/parse-compendium.ts`) — extract plants, conditions, body systems, traditions, preparations, substances, cautions, and all relationships | ✅ Done |
| 2.4 | Build schema validator (`pipeline/validate.ts`) — validate seed.json against JSON Schema + referential integrity checks | ✅ Done |
| 2.5 | Run parser against compendium and verify output seed.json is correct | ✅ Done |

**Results:** 146 plants, 71 conditions, 13 body systems, 5 traditions, 22 preparations, 29 substances, 25 cautions, 39 synergies, 267 plant-condition links, 231 plant-tradition links.

---

## Milestone 3: Database Schema & Seeding ✅

Create the D1 (SQLite) schema and a seed script to populate it.

| # | Task | Status |
|---|------|--------|
| 3.1 | Create `worker/schema.sql` with all tables, indexes, and FTS5 virtual table | ✅ Done |
| 3.2 | Build D1 seed script (`pipeline/seed-d1.ts`) — generate SQL inserts from seed.json | ✅ Done |
| 3.3 | Test locally with SQLite (create local DB, run schema, seed, verify queries and joins) | ✅ Done |

---

## Milestone 4: API Worker — Core Routes ✅

Build the Hono-based Cloudflare Worker API with all endpoints.

| # | Task | Status |
|---|------|--------|
| 4.1 | Scaffold `worker/` workspace (package.json, tsconfig.json, wrangler.toml) | ✅ Done |
| 4.2 | Create Hono app entry point (`worker/src/index.ts`) and shared types (`worker/src/types.ts`) | ✅ Done |
| 4.3 | Implement DB query helpers (`worker/src/db/queries.ts`) | ✅ Done |
| 4.4 | Implement `GET /api/search` (FTS5 full-text search with type/tradition/system filters) | ✅ Done |
| 4.5 | Implement `GET /api/plants` and `GET /api/plants/:slug` (list + detail with all relations) | ✅ Done |
| 4.6 | Implement `GET /api/conditions/:slug` and `GET /api/systems` | ✅ Done |
| 4.7 | Implement `GET /api/graph/synergies` and `GET /api/graph/plant/:slug` (D3-ready graph data) | ✅ Done |
| 4.8 | Implement `GET /api/traditions/:slug` and `GET /api/substances/:slug` | ✅ Done |
| 4.9 | Add CORS middleware, error handling, 404 fallback, and health check endpoint | ✅ Done |

### API Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=&type=` | Full-text search across all entities |
| `GET` | `/api/plants?tradition=&system=` | List plants with optional filters |
| `GET` | `/api/plants/:slug` | Full plant detail with all relations |
| `GET` | `/api/conditions/:slug` | Condition detail with plants that treat it |
| `GET` | `/api/systems` | List body systems with condition counts |
| `GET` | `/api/graph/synergies` | Full synergy graph (nodes + edges for D3) |
| `GET` | `/api/graph/plant/:slug` | Ego-network for a single plant |
| `GET` | `/api/traditions/:slug` | Tradition detail with associated plants |
| `GET` | `/api/substances/:slug` | Substance detail with plants that contain it |
| `GET` | `/api/health` | Health check |

---

## Milestone 5: Frontend — Core Shell & Search ✅

Static SPA deployed to Cloudflare Pages. Vite + vanilla TypeScript.

| # | Task | Status |
|---|------|--------|
| 5.1 | Scaffold `web/` workspace (package.json, tsconfig.json, vite.config.ts) | ✅ Done |
| 5.2 | Create `index.html`, global styles (`style.css`), and `main.ts` with client-side router | ✅ Done |
| 5.3 | Build API fetch wrapper (`web/src/lib/api.ts`) | ✅ Done |
| 5.4 | Build navigation component and layout shell | ✅ Done |
| 5.5 | Build search page with search bar, faceted filters, and result cards | ✅ Done |
| 5.6 | Build plant detail page (conditions, preparations, synergies, cautions) | ✅ Done |
| 5.7 | Build condition page (plants that treat it, grouped by tradition) | ✅ Done |
| 5.8 | Build tradition overview page | ✅ Done |
| 5.9 | Add plant illustrations (Köhler's Medizinal-Pflanzen from Wikimedia Commons / public domain) to plant detail view | ⬚ Pending |

---

## Milestone 6: Frontend — Network Graph Explorer ✅

The signature feature: an interactive D3.js force-directed graph.

| # | Task | Status |
|---|------|--------|
| 6.1 | Build graph data transform utilities (`web/src/lib/graph-utils.ts`) | ✅ Done |
| 6.2 | Build D3 force-directed graph component (`web/src/components/graph.ts`) | ✅ Done |
| 6.3 | Build explorer page with graph + search/filter sidebar | ✅ Done |
| 6.4 | Implement interactions: click node (expand/detail), hover (highlight neighbors), click edge (synergy info) | ✅ Done |
| 6.5 | Implement tradition and body system filters on graph view | ⬚ Pending |

### Interaction Model

| Action | Result |
|--------|--------|
| Click node | Expand: show connected nodes. Panel: show plant/condition detail |
| Hover node | Highlight connected edges and neighbors. Tooltip with name + key info |
| Click edge | Panel: show synergy mechanism, combined effect, tradition source |
| Search | Center graph on matching node, highlight path |
| Filter by tradition | Gray out or hide non-matching nodes |
| Filter by body system | Color-code or filter to one system |

---

## Milestone 7: CI/CD & Deployment ⬚

Automated deployment via GitHub Actions.

| # | Task | Status |
|---|------|--------|
| 7.1 | Create `.github/workflows/validate.yml` (PR check: parse + schema validation) | ⬚ Pending |
| 7.2 | Create `.github/workflows/deploy.yml` (main push: parse → seed D1 → deploy Worker → deploy Pages) | ⬚ Pending |
| 7.3 | End-to-end smoke test: full pipeline from `.adoc` → live site | ⬚ Pending |

### Deployment Flow

```
git push to main
  → GitHub Actions
    → Parse compendium → seed.json
    → Validate schema
    → Seed Cloudflare D1 database
    → Deploy Cloudflare Worker (API)
    → Deploy Cloudflare Pages (frontend)
```

---

## Data Sources

- **Compendium:** `doc/natures-pharmacy-compendium.adoc` — curated knowledge base of 128+ medicinal plants across 5 traditions (Ayurveda, Unani, TCM, European Herbalism, Prophetic Medicine)
- **Illustrations:** Köhler's Medizinal-Pflanzen (public domain via Wikimedia Commons) and other open sources

## Tech Stack

| Component | Technology |
|-----------|------------|
| Data source | AsciiDoc compendium |
| Pipeline | Node.js / TypeScript parser |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite at the edge) |
| Search | FTS5 full-text search |
| Frontend | Vite + vanilla TypeScript SPA |
| Visualization | D3.js force-directed graph |
| Hosting | Cloudflare Pages |
| CI/CD | GitHub Actions |
| Repository | [github.com/EsteSystems/plantme](https://github.com/EsteSystems/plantme) |
