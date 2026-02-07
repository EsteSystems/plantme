# PlantMe

A searchable knowledge base and interactive explorer for traditional plant-based medicine. Search by condition, plant, active substance, tradition, or preparation method — and explore plant synergies through an interactive network graph.

## Architecture

- **Data source:** AsciiDoc compendium (`doc/natures-pharmacy-compendium.adoc`)
- **Pipeline:** Node.js parser transforms AsciiDoc → structured JSON → D1 database
- **API:** Hono on Cloudflare Workers, backed by Cloudflare D1 (SQLite)
- **Frontend:** Vite + vanilla TypeScript SPA on Cloudflare Pages
- **Visualization:** D3.js force-directed graph for plant synergy exploration

See [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) for full details.

## Repository Structure

```
PlantMe/
├── doc/            # Source compendium and architecture docs
├── pipeline/       # AsciiDoc parser, validator, and D1 seeder
├── worker/         # Cloudflare Worker API (Hono)
├── web/            # Frontend SPA (Vite + TypeScript)
└── .github/        # CI/CD workflows
```

## Prerequisites

- Node.js >= 20
- npm >= 10
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)

## Setup

```bash
# Install all workspace dependencies
npm install

# Parse the compendium into seed.json
npm run parse

# Validate the generated data
npm run validate

# Start the API worker locally
npm run dev:worker

# Start the frontend dev server
npm run dev:web
```

## Deployment

Deployment is handled via GitHub Actions on push to `main`:

1. Parse compendium → `seed.json`
2. Validate schema
3. Seed Cloudflare D1 database
4. Deploy Cloudflare Worker (API)
5. Deploy Cloudflare Pages (frontend)

See `.github/workflows/deploy.yml` for details.

## Data Sources

- **Compendium:** Curated knowledge base of 128+ medicinal plants across 5 traditions
- **Illustrations:** Köhler's Medizinal-Pflanzen (public domain, via Wikimedia Commons)

## License

MIT
