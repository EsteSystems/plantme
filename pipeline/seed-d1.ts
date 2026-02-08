/**
 * seed-d1.ts
 *
 * Generates SQL INSERT statements from seed.json to seed a D1 database.
 * Output: seed.sql file that can be executed with `wrangler d1 execute`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = resolve(__dirname, "seed.json");
const outputPath = resolve(__dirname, "seed.sql");

console.log("Generating seed SQL...");

const seed = JSON.parse(readFileSync(seedPath, "utf-8"));

function esc(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return esc(JSON.stringify(val));
  return `'${String(val).replace(/'/g, "''")}'`;
}

const lines: string[] = [];

lines.push("-- Auto-generated seed data for PlantMe D1 database");
lines.push("-- Generated: " + new Date().toISOString());
lines.push("");
lines.push("BEGIN TRANSACTION;");
lines.push("");

// ── Body systems ─────────────────────────────────────────────────────────────
lines.push("-- Body Systems");
for (const s of seed.body_systems) {
  lines.push(
    `INSERT OR REPLACE INTO body_systems (id, slug, name, section_num, description) VALUES (${s.id}, ${esc(s.slug)}, ${esc(s.name)}, ${s.section_num}, ${esc(s.description)});`
  );
}
lines.push("");

// ── Traditions ───────────────────────────────────────────────────────────────
lines.push("-- Traditions");
for (const t of seed.traditions) {
  lines.push(
    `INSERT OR REPLACE INTO traditions (id, slug, name, description) VALUES (${t.id}, ${esc(t.slug)}, ${esc(t.name)}, ${esc(t.description)});`
  );
}
lines.push("");

// ── Preparations ─────────────────────────────────────────────────────────────
lines.push("-- Preparations");
for (const p of seed.preparations) {
  lines.push(
    `INSERT OR REPLACE INTO preparations (id, slug, name, instructions, equipment) VALUES (${p.id}, ${esc(p.slug)}, ${esc(p.name)}, ${esc(p.instructions)}, ${esc(p.equipment)});`
  );
}
lines.push("");

// ── Substances ───────────────────────────────────────────────────────────────
lines.push("-- Substances");
for (const s of seed.substances) {
  lines.push(
    `INSERT OR REPLACE INTO substances (id, slug, name, description, refs) VALUES (${s.id}, ${esc(s.slug)}, ${esc(s.name)}, ${esc(s.description)}, ${esc(s.refs ? JSON.stringify(s.refs) : null)});`
  );
}
lines.push("");

// ── Cautions ─────────────────────────────────────────────────────────────────
lines.push("-- Cautions");
for (const c of seed.cautions) {
  lines.push(
    `INSERT OR REPLACE INTO cautions (id, slug, name, severity, detail, refs) VALUES (${c.id}, ${esc(c.slug)}, ${esc(c.name)}, ${esc(c.severity)}, ${esc(c.detail)}, ${esc(c.refs ? JSON.stringify(c.refs) : null)});`
  );
}
lines.push("");

// ── Plants ───────────────────────────────────────────────────────────────────
lines.push("-- Plants");
for (const p of seed.plants) {
  lines.push(
    `INSERT OR REPLACE INTO plants (id, slug, name, scientific, alt_names, description, historical, part_used, image_url) VALUES (${p.id}, ${esc(p.slug)}, ${esc(p.name)}, ${esc(p.scientific)}, ${esc(p.alt_names)}, ${esc(p.description)}, ${esc(p.historical)}, ${esc(p.part_used)}, ${esc(p.image_url)});`
  );
}
lines.push("");

// ── Conditions ───────────────────────────────────────────────────────────────
lines.push("-- Conditions");
for (const c of seed.conditions) {
  lines.push(
    `INSERT OR REPLACE INTO conditions (id, slug, name, description, system_id) VALUES (${c.id}, ${esc(c.slug)}, ${esc(c.name)}, ${esc(c.description)}, ${c.system_id});`
  );
}
lines.push("");

// ── Relationships ────────────────────────────────────────────────────────────

lines.push("-- Plant-Condition links");
for (const pc of seed.plant_conditions) {
  lines.push(
    `INSERT OR REPLACE INTO plant_conditions (plant_id, condition_id, dosage, notes) VALUES (${pc.plant_id}, ${pc.condition_id}, ${esc(pc.dosage)}, ${esc(pc.notes)});`
  );
}
lines.push("");

lines.push("-- Plant-Tradition links");
for (const pt of seed.plant_traditions) {
  lines.push(
    `INSERT OR REPLACE INTO plant_traditions (plant_id, tradition_id, historical_note) VALUES (${pt.plant_id}, ${pt.tradition_id}, ${esc(pt.historical_note)});`
  );
}
lines.push("");

lines.push("-- Plant-Preparation links");
for (const pp of seed.plant_preparations) {
  lines.push(
    `INSERT OR REPLACE INTO plant_preparations (plant_id, preparation_id, instructions) VALUES (${pp.plant_id}, ${pp.preparation_id}, ${esc(pp.instructions)});`
  );
}
lines.push("");

lines.push("-- Plant-Substance links");
for (const ps of seed.plant_substances) {
  lines.push(
    `INSERT OR REPLACE INTO plant_substances (plant_id, substance_id, part_used) VALUES (${ps.plant_id}, ${ps.substance_id}, ${esc(ps.part_used)});`
  );
}
lines.push("");

lines.push("-- Plant-Caution links");
for (const pca of seed.plant_cautions) {
  lines.push(
    `INSERT OR REPLACE INTO plant_cautions (plant_id, caution_id, detail) VALUES (${pca.plant_id}, ${pca.caution_id}, ${esc(pca.detail)});`
  );
}
lines.push("");

lines.push("-- Synergies");
for (const s of seed.synergies) {
  lines.push(
    `INSERT OR REPLACE INTO synergies (plant_a_id, plant_b_id, mechanism, effect, tradition, refs) VALUES (${s.plant_a_id}, ${s.plant_b_id}, ${esc(s.mechanism)}, ${esc(s.effect)}, ${esc(s.tradition)}, ${esc(s.refs ? JSON.stringify(s.refs) : null)});`
  );
}
lines.push("");

// ── FTS5 search index ────────────────────────────────────────────────────────
lines.push("-- Full-text search index");
lines.push("DELETE FROM search_index;");
lines.push("");

for (const p of seed.plants) {
  const altNames = Array.isArray(p.alt_names) ? p.alt_names.join(", ") : "";
  const content = [p.description, p.historical].filter(Boolean).join(" ");
  lines.push(
    `INSERT INTO search_index (entity_type, entity_slug, name, alt_names, description, content) VALUES ('plant', ${esc(p.slug)}, ${esc(p.name)}, ${esc(altNames)}, ${esc(p.description)}, ${esc(content)});`
  );
}
lines.push("");

for (const c of seed.conditions) {
  lines.push(
    `INSERT INTO search_index (entity_type, entity_slug, name, alt_names, description, content) VALUES ('condition', ${esc(c.slug)}, ${esc(c.name)}, '', ${esc(c.description)}, ${esc(c.description)});`
  );
}
lines.push("");

for (const s of seed.substances) {
  lines.push(
    `INSERT INTO search_index (entity_type, entity_slug, name, alt_names, description, content) VALUES ('substance', ${esc(s.slug)}, ${esc(s.name)}, '', ${esc(s.description)}, ${esc(s.description)});`
  );
}
lines.push("");

for (const t of seed.traditions) {
  lines.push(
    `INSERT INTO search_index (entity_type, entity_slug, name, alt_names, description, content) VALUES ('tradition', ${esc(t.slug)}, ${esc(t.name)}, '', ${esc(t.description)}, ${esc(t.description)});`
  );
}
lines.push("");

lines.push("COMMIT;");

writeFileSync(outputPath, lines.join("\n"), "utf-8");
console.log(`Seed SQL written to: ${outputPath}`);
console.log(`  Lines: ${lines.length}`);
console.log(`  Size: ${(Buffer.byteLength(lines.join("\n")) / 1024).toFixed(1)} KB`);
