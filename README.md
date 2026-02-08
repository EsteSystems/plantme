# PlantMe

A searchable knowledge base and interactive explorer for traditional plant-based medicine. Search by condition, plant, active substance, tradition, or preparation method — and explore plant synergies through an interactive network graph.

**Live:** [plantme.pages.dev](https://plantme.pages.dev)

## Architecture

- **Data source:** AsciiDoc compendium (`doc/natures-pharmacy-compendium.adoc`)
- **Pipeline:** TypeScript parser transforms AsciiDoc → structured JSON → SQL seed data
- **API:** Hono on Cloudflare Workers, backed by Cloudflare D1 (SQLite)
- **Frontend:** Vite + vanilla TypeScript SPA on Cloudflare Pages
- **Visualization:** D3.js force-directed graph for plant synergy exploration
- **Illustrations:** 58 Kohler's Medizinal-Pflanzen botanical plates (public domain) + Wikimedia fallbacks

See [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) for full details.

## Repository Structure

```
PlantMe/
├── doc/            # Source compendium and architecture docs
├── pipeline/       # AsciiDoc parser, validator, and D1 seeder
├── worker/         # Cloudflare Worker API (Hono)
└── web/            # Frontend SPA (Vite + TypeScript)
    └── functions/  # Cloudflare Pages Functions (API proxy)
```

## Prerequisites

- Node.js >= 20
- npm >= 10
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (v4+, installed as workspace dependency)

## Setup

```bash
# Install all workspace dependencies
npm install

# Parse the compendium and generate seed data
npm run parse

# Validate the generated data
npm run validate

# Generate seed.sql from seed.json
npm run seed

# Seed the local D1 database
cd worker
npx wrangler d1 execute DB --local --file=schema.sql
npx wrangler d1 execute DB --local --file=../pipeline/seed.sql
cd ..

# Start the API worker locally
npm run dev:worker

# Start the frontend dev server (in another terminal)
npm run dev:web
```

## Deployment

```bash
# Deploy the Worker API
npm run deploy:worker

# Seed the remote D1 database
cd worker
npx wrangler d1 execute DB --remote --file=schema.sql
npx wrangler d1 execute DB --remote --file=../pipeline/seed.sql
cd ..

# Build and deploy the frontend (includes Pages Functions API proxy)
npm run build:web
cd web
npx wrangler pages deploy dist --project-name=plantme
```

## Data Sources

- **Compendium:** Curated knowledge base of 128+ medicinal plants across 5 traditions (Ayurveda, Unani, TCM, European Herbalism, Prophetic Medicine)
- **Illustrations:** 58 Kohler's Medizinal-Pflanzen plates (public domain) with Wikimedia Commons fallbacks
- **References:** ~170 PubMed/DOI-linked scientific papers validating biochemistry claims

## License

MIT
