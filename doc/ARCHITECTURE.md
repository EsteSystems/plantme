# PlantMe — Architecture

## Vision

PlantMe is a searchable knowledge base and interactive explorer for traditional plant-based medicine. Users can search by **affection** (condition/symptom), **plant**, **active substance**, **tradition**, or **preparation method** and receive structured information on remedies, cultural context, synergistic combinations, and safety. A network visualization renders the web of relationships between plants, conditions, and traditions as an interactive graph.

---

## Data Model

The compendium is inherently a **graph**, not a table. The core entities and their relationships:

```
                    ┌─────────────┐
                    │  Tradition  │
                    │ (Ayurveda,  │
                    │  Unani, TCM,│
                    │  European,  │
                    │  Prophetic) │
                    └──────┬──────┘
                           │ practiced_in
                           ▼
┌──────────┐  treats  ┌─────────┐  prepared_as  ┌─────────────┐
│Condition │◄─────────│  Plant  │──────────────►│ Preparation │
│(Affection│          │         │               │   Method    │
│ /Symptom)│          │         │               └─────────────┘
└──────────┘          │         │
     │                │         │
     │ belongs_to     │         │  synergy_with
     ▼                │         │◄──────────────┐
┌──────────┐          │         │               │
│  Body    │          └────┬────┘               │
│  System  │               │                ┌───┴─────┐
│ (Section)│               │ contains       │  Plant  │
└──────────┘               ▼                │ (other) │
                    ┌─────────────┐         └─────────┘
                    │   Active    │
                    │ Substance / │
                    │  Property   │
                    └─────────────┘
```

### Entities

| Entity | Examples | Count |
|--------|----------|-------|
| **Plant** | Ginger, Turmeric, Valerian, Hawthorn | 128+ |
| **Condition** | Nausea, insomnia, UTI, joint pain | ~80 |
| **Body System** | Digestive, Respiratory, Nervous, Circulatory | 13 |
| **Tradition** | Ayurveda, Unani, TCM, European Herbalism, Prophetic Medicine | 5 |
| **Preparation** | Decoction, tincture, poultice, infusion, oil | ~15 |
| **Active Substance** | Curcumin, salicin, allicin, berberine | ~60 |
| **Caution** | Pregnancy, blood thinners, liver conditions | ~30 |

### Relationships (Edges)

| Relationship | From → To | Properties |
|--------------|-----------|------------|
| `TREATS` | Plant → Condition | dosage, efficacy_notes |
| `BELONGS_TO` | Condition → Body System | subsection |
| `USED_IN` | Plant → Tradition | historical_note |
| `PREPARED_AS` | Plant → Preparation | instructions, duration |
| `CONTAINS` | Plant → Active Substance | concentration, part_used |
| `SYNERGY_WITH` | Plant → Plant | mechanism, combined_effect |
| `CAUTION` | Plant → Caution | severity, detail |
| `CONTRAINDICATED_WITH` | Plant → Drug/Condition | mechanism |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Edge                              │
│                                                                       │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐   │
│  │  Cloudflare Pages    │     │      Cloudflare Worker (API)     │   │
│  │                      │     │                                  │   │
│  │  - Static SPA        │     │  /api/search?q=...&type=...      │   │
│  │  - Search UI         │     │  /api/plants/:slug               │   │
│  │  - Graph Explorer    │     │  /api/conditions/:slug           │   │
│  │  - Plant Detail View │     │  /api/graph/synergies            │   │
│  │  - Illustrations     │     │  /api/graph/plant/:slug          │   │
│  │                      │     │  /api/traditions/:slug           │   │
│  │  (Vite + Vanilla TS) │     │  /api/substances/:slug           │   │
│  │                      │     │                                  │   │
│  │  ┌────────────────┐  │     │  Runtime: Hono on Workers        │   │
│  │  │ Pages Functions│──┼────►│                                  │   │
│  │  │ /api/* proxy   │  │     │                                  │   │
│  │  └────────────────┘  │     └──────────┬───────────────────────┘   │
│  └──────────────────────┘                │                            │
│                                          │                            │
│                                          ▼                            │
│                                 ┌──────────────┐                     │
│                                 │ Cloudflare   │                     │
│                                 │ D1 (SQLite)  │                     │
│                                 │              │                     │
│                                 │ Structured   │                     │
│                                 │ plant data,  │                     │
│                                 │ relations,   │                     │
│                                 │ full-text,   │                     │
│                                 │ references   │                     │
│                                 └──────────────┘                     │
│                                                                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Data Pipeline (`/pipeline/`)

Transforms the AsciiDoc compendium into structured, queryable data.

```
natures-pharmacy-compendium.adoc
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌────────────┐
  │ parse-adoc  │────►│ seed.json    │────►│  D1 seed   │
  │ (Node.js    │     │ (normalized  │     │  (SQL INS.) │
  │  script)    │     │  entities +  │     │            │
  │             │     │  relations)  │     │            │
  └─────────────┘     └──────────────┘     └────────────┘
```

**Parser responsibilities:**
- Extract plant entries (name, scientific name, alt names, traditions, preparation, cautions)
- Extract conditions and map to body systems
- Identify synergy pairs from "Synergy Formulas" and compatibility tables
- Extract active substances where mentioned
- Generate slugs for URL-friendly identifiers
- Produce `seed.json` conforming to a strict JSON Schema

**Technology:** TypeScript script using `asciidoctor.js` for AsciiDoc parsing. Includes biochemistry descriptions and scientific paper references (PubMed/DOI) for substances, synergies, and cautions. Runs locally.

### 2. Database Schema (Cloudflare D1)

D1 is SQLite at the edge. Schema:

```sql
-- Core entities
CREATE TABLE plants (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    scientific  TEXT,
    alt_names   TEXT,            -- JSON array
    description TEXT,
    historical  TEXT,
    part_used   TEXT,
    image_url   TEXT
);

CREATE TABLE conditions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    system_id   INTEGER REFERENCES body_systems(id)
);

CREATE TABLE body_systems (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    section_num INTEGER,
    description TEXT
);

CREATE TABLE traditions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE preparations (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    instructions TEXT,
    equipment   TEXT
);

CREATE TABLE substances (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    refs        TEXT            -- JSON array of Reference objects
);

CREATE TABLE cautions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    severity    TEXT CHECK(severity IN ('info', 'warning', 'danger')),
    detail      TEXT,
    refs        TEXT            -- JSON array of Reference objects
);

-- Relationships (edges)
CREATE TABLE plant_conditions (
    plant_id    INTEGER REFERENCES plants(id),
    condition_id INTEGER REFERENCES conditions(id),
    dosage      TEXT,
    notes       TEXT,
    PRIMARY KEY (plant_id, condition_id)
);

CREATE TABLE plant_traditions (
    plant_id    INTEGER REFERENCES plants(id),
    tradition_id INTEGER REFERENCES traditions(id),
    historical_note TEXT,
    PRIMARY KEY (plant_id, tradition_id)
);

CREATE TABLE plant_preparations (
    plant_id    INTEGER REFERENCES plants(id),
    preparation_id INTEGER REFERENCES preparations(id),
    instructions TEXT,
    PRIMARY KEY (plant_id, preparation_id)
);

CREATE TABLE plant_substances (
    plant_id    INTEGER REFERENCES plants(id),
    substance_id INTEGER REFERENCES substances(id),
    part_used   TEXT,
    PRIMARY KEY (plant_id, substance_id)
);

CREATE TABLE plant_cautions (
    plant_id    INTEGER REFERENCES plants(id),
    caution_id  INTEGER REFERENCES cautions(id),
    detail      TEXT,
    PRIMARY KEY (plant_id, caution_id)
);

CREATE TABLE synergies (
    plant_a_id  INTEGER REFERENCES plants(id),
    plant_b_id  INTEGER REFERENCES plants(id),
    mechanism   TEXT,
    effect      TEXT,
    tradition   TEXT,
    refs        TEXT,           -- JSON array of Reference objects
    CHECK (plant_a_id < plant_b_id),
    PRIMARY KEY (plant_a_id, plant_b_id)
);

-- Full-text search
CREATE VIRTUAL TABLE search_index USING fts5(
    entity_type,   -- 'plant', 'condition', 'substance', 'tradition'
    entity_slug,
    name,
    alt_names,
    description,
    content
);
```

### 3. API Worker (`/worker/`)

Built with **Hono** on Cloudflare Workers. Lightweight, fast, type-safe.

```
worker/
├── src/
│   ├── index.ts          # Hono app, route registration
│   ├── routes/
│   │   ├── search.ts     # GET /api/search?q=&type=&tradition=&system=
│   │   ├── plants.ts     # GET /api/plants, /api/plants/:slug
│   │   ├── conditions.ts # GET /api/conditions, /api/conditions/:slug
│   │   ├── graph.ts      # GET /api/graph/synergies, /api/graph/plant/:slug
│   │   ├── traditions.ts # GET /api/traditions/:slug
│   │   ├── substances.ts # GET /api/substances/:slug
│   │   └── systems.ts    # GET /api/systems
│   ├── db/
│   │   └── queries.ts    # Prepared D1 queries
│   └── types.ts          # Shared TypeScript types
├── schema.sql
├── wrangler.toml
├── package.json
└── tsconfig.json
```

#### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=headache&type=condition` | Full-text search across all entities. Optional `type` filter. |
| `GET` | `/api/plants` | List all plants. Supports `?tradition=ayurveda`, `?system=digestive`. |
| `GET` | `/api/plants/:slug` | Full plant detail: conditions it treats, preparations, synergies, cautions. |
| `GET` | `/api/conditions/:slug` | Condition detail: all plants that treat it, organized by tradition. |
| `GET` | `/api/graph/synergies` | Full synergy graph (nodes + edges) for D3 visualization. |
| `GET` | `/api/graph/plant/:slug` | Ego-network: a plant and all its connections (conditions, synergies, traditions). |
| `GET` | `/api/traditions/:slug` | All plants/conditions within a tradition. |
| `GET` | `/api/substances/:slug` | Substance detail: which plants contain it, what it treats. |
| `GET` | `/api/systems` | List body systems with condition counts. |

#### Search Implementation

D1's FTS5 handles full-text search. The search endpoint:

```typescript
// Simplified example
app.get('/api/search', async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('type'); // optional: plant, condition, substance

  let sql = `SELECT entity_type, entity_slug, name, snippet(search_index, 5, '<mark>', '</mark>', '...', 32) as excerpt
             FROM search_index WHERE search_index MATCH ?`;

  const params: string[] = [q + '*']; // prefix matching

  if (type) {
    sql += ` AND entity_type = ?`;
    params.push(type);
  }

  sql += ` ORDER BY rank LIMIT 20`;

  const results = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results);
});
```

### 4. Frontend (`/web/`)

Static SPA deployed to **Cloudflare Pages**. Minimal dependencies, fast loading.

```
web/
├── src/
│   ├── index.html
│   ├── main.ts
│   ├── style.css
│   ├── favicon.svg
│   ├── pages/
│   │   ├── search.ts        # Search bar + results
│   │   ├── plant-detail.ts  # Single plant view with citations
│   │   ├── condition.ts     # Condition → plant list
│   │   ├── explorer.ts      # Network graph explorer (D3)
│   │   ├── substance.ts     # Substance detail with refs
│   │   └── traditions.ts    # Tradition overview + detail
│   ├── components/
│   │   ├── search-bar.ts
│   │   ├── plant-card.ts
│   │   ├── graph.ts         # D3 force-directed graph
│   │   └── tag-list.ts      # Reusable tag/chip list
│   └── lib/
│       ├── api.ts           # Fetch wrapper for Worker API
│       ├── citations.ts     # Inline [N] citation rendering (DOM API)
│       ├── illustrations.ts # Kohler plant illustration mapping
│       ├── router.ts        # Client-side SPA router
│       └── types.ts         # Frontend type definitions
├── functions/
│   └── api/
│       └── [[path]].ts      # Pages Functions: proxies /api/* to Worker
├── public/
│   ├── _redirects
│   └── illustrations/       # 58 Kohler botanical JPGs
├── vite.config.ts
├── package.json
└── tsconfig.json
```

**Stack:** Vite + TypeScript + vanilla DOM + D3.js for graph visualization. No framework needed for this scale.

### 5. Network Visualization

The synergy graph is the signature feature. Built with **D3.js force-directed graph**.

```
┌─────────────────────────────────────────────────────────┐
│                   Graph Explorer                         │
│                                                          │
│    [Search: ________]  [Filter: Tradition ▼] [System ▼] │
│                                                          │
│         ○ Turmeric                                       │
│        / \            ○ Boswellia                        │
│       /   \          /                                   │
│  ○ Black ──○ Ginger ○                                   │
│  Pepper    │    \                                        │
│            │     ○ Willow Bark                           │
│            │                                             │
│       ○ Cinnamon    Legend:                              │
│                     ● Plant (size = # connections)       │
│                     ─ Synergy link                       │
│                     Color = Body system / Tradition      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Graph Data Model (API response for D3)

```typescript
interface GraphData {
  nodes: {
    id: string;         // plant slug
    label: string;      // display name
    type: 'plant' | 'condition' | 'tradition' | 'substance';
    group: string;      // body system or tradition (for coloring)
    size: number;       // degree centrality (connection count)
    meta: Record<string, string>;
  }[];
  edges: {
    source: string;
    target: string;
    type: 'synergy' | 'treats' | 'used_in' | 'contains';
    label?: string;     // e.g. "anti-inflammatory synergy"
    weight: number;     // strength of relationship
  }[];
}
```

#### Interaction Model

| Action | Result |
|--------|--------|
| **Click node** | Expand: show connected nodes. Panel: show plant/condition detail. |
| **Hover node** | Highlight connected edges and neighbors. Tooltip with name + key info. |
| **Click edge** | Panel: show synergy mechanism, combined effect, tradition source. |
| **Search** | Center graph on matching node, highlight path. |
| **Filter by tradition** | Gray out non-matching nodes, or hide them entirely. |
| **Filter by body system** | Color-code or filter to one system. |
| **Zoom/Pan** | Standard D3 zoom behavior. |

---

## Repository Structure

```
PlantMe/
├── doc/
│   ├── ARCHITECTURE.md                         # This file
│   ├── development-plan.md                     # Development roadmap
│   └── natures-pharmacy-compendium.adoc        # Source compendium
├── pipeline/
│   ├── parse-compendium.ts                     # AsciiDoc → seed.json
│   ├── validate.ts                             # JSON Schema validation
│   ├── seed-d1.ts                              # seed.json → seed.sql
│   ├── schema.json                             # Entity/relation JSON Schema
│   ├── koehler-illustrations.json              # Illustration URL mapping
│   ├── seed.json                               # Generated structured data
│   └── seed.sql                                # Generated SQL seed file
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── db/
│   │   └── types.ts
│   ├── schema.sql
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── style.css
│   │   ├── pages/
│   │   ├── components/
│   │   └── lib/
│   ├── functions/                              # Cloudflare Pages Functions
│   │   └── api/[[path]].ts                     # API proxy to Worker
│   ├── public/
│   │   └── illustrations/                      # 58 Kohler botanical JPGs
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── package.json                                # Workspace root (npm workspaces)
├── .gitignore
└── README.md
```

---

## Deployment

Deployment is currently manual via Wrangler CLI:

```bash
# 1. Parse compendium and generate seed data
npm run parse && npm run validate && npm run seed

# 2. Deploy Worker API
npm run deploy:worker

# 3. Seed remote D1 database
cd worker
npx wrangler d1 execute DB --remote --file=schema.sql
npx wrangler d1 execute DB --remote --file=../pipeline/seed.sql
cd ..

# 4. Build and deploy frontend (with Pages Functions API proxy)
npm run build:web
cd web && npx wrangler pages deploy dist --project-name=plantme
```

**Note:** Remote D1 does not support `BEGIN TRANSACTION`/`COMMIT` — the seed-d1.ts script strips these automatically. When re-seeding, drop existing tables first with `PRAGMA foreign_keys = OFF` to avoid constraint errors.

---

## Configuration (`wrangler.toml`)

```toml
name = "plantme-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "plantme-db"
database_id = "f7b4e815-e542-4043-80c8-ba96c1b4f74d"
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **D1 (SQLite) over KV** | Relational data with joins. Graph queries need JOINs. FTS5 built in. |
| **Hono over itty-router** | TypeScript-first, middleware support, OpenAPI generation possible. |
| **D3.js over Cytoscape** | Lighter, more control over aesthetics, better for force-directed layouts. |
| **Vanilla TS over React** | Small app. No reactivity complexity needed. Fast loads. |
| **AsciiDoc as source of truth** | The compendium already exists in this format. Edit prose, not databases. |
| **Parse pipeline in CI** | Content authors edit `.adoc`, push to GitHub, data is automatically structured. |
| **Edge deployment** | Cloudflare Workers + D1 = globally distributed, sub-50ms responses, zero cold starts. |

---

## What's Implemented

- Full-text search across plants, conditions, substances, and traditions (D1 FTS5)
- Plant detail pages with conditions, preparations, synergies, cautions, and illustrations
- Scientific paper references with inline `[N]` citations linking to PubMed/DOI
- Substance and condition detail pages
- Tradition browsing and filtering
- D3 force-directed synergy graph explorer with tradition/system filters
- 58 Kohler botanical illustrations with Wikimedia fallback
- Pages Functions API proxy (no CORS issues in production)

## Future Considerations

- **CI/CD pipeline:** GitHub Actions for automated parse → seed → deploy on push to main
- **Multilingual support:** The compendium references Arabic, Sanskrit, Chinese names. Could expand to full i18n.
- **User contributions:** Allow practitioners to submit additions via GitHub PRs (content stays in `.adoc`).
- **Dosage calculator:** Interactive tool using Appendix D logic (age, weight, constitution adjustments).
- **Seasonal calendar:** "What to harvest this month" based on Appendix B data and user's location.
- **Offline PWA:** Cache the entire dataset locally for field use (the full DB is small enough).
- **API for external consumers:** Public API with rate limiting for other herbal medicine projects.
- **LLM-assisted search:** Natural language queries ("my child has a cough and can't sleep") mapped to conditions.
