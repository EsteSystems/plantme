/**
 * validate.ts
 *
 * Validates seed.json against the JSON Schema and performs
 * additional integrity checks on relationships.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));

const schemaPath = resolve(__dirname, "schema.json");
const seedPath = resolve(__dirname, "seed.json");

console.log("Validating seed.json...\n");

// Load files
let seed: Record<string, unknown[]>;
try {
  seed = JSON.parse(readFileSync(seedPath, "utf-8"));
} catch (e) {
  console.error("ERROR: Cannot read seed.json. Run `npm run parse` first.");
  process.exit(1);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

// ── JSON Schema validation ───────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
const valid = validate(seed);

if (!valid) {
  console.error("Schema validation FAILED:");
  for (const err of validate.errors || []) {
    console.error(`  ${err.instancePath}: ${err.message}`);
  }
  process.exit(1);
}
console.log("✓ JSON Schema validation passed");

// ── Integrity checks ────────────────────────────────────────────────────────

let errors = 0;

function check(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ ${msg}`);
    errors++;
  }
}

// Entity counts
const plants = seed.plants as { id: number; slug: string; name: string }[];
const conditions = seed.conditions as { id: number; system_id: number }[];
const bodySystems = seed.body_systems as { id: number }[];
const traditions = seed.traditions as { id: number }[];
const preparations = seed.preparations as { id: number }[];
const substances = seed.substances as { id: number }[];
const cautions = seed.cautions as { id: number }[];

console.log(`\nEntity counts:`);
console.log(`  Plants:       ${plants.length}`);
console.log(`  Conditions:   ${conditions.length}`);
console.log(`  Body Systems: ${bodySystems.length}`);
console.log(`  Traditions:   ${traditions.length}`);
console.log(`  Preparations: ${preparations.length}`);
console.log(`  Substances:   ${substances.length}`);
console.log(`  Cautions:     ${cautions.length}`);

check(plants.length >= 50, `Expected at least 50 plants, got ${plants.length}`);
check(conditions.length >= 20, `Expected at least 20 conditions, got ${conditions.length}`);
check(bodySystems.length >= 10, `Expected at least 10 body systems, got ${bodySystems.length}`);
check(traditions.length === 5, `Expected 5 traditions, got ${traditions.length}`);

// Unique slugs
const plantSlugs = new Set(plants.map((p) => p.slug));
check(plantSlugs.size === plants.length, `Duplicate plant slugs found (${plants.length} plants, ${plantSlugs.size} unique slugs)`);

// Referential integrity
const plantIds = new Set(plants.map((p) => p.id));
const conditionIds = new Set(conditions.map((c) => c.id));
const systemIds = new Set(bodySystems.map((s) => s.id));
const traditionIds = new Set(traditions.map((t) => t.id));
const prepIds = new Set(preparations.map((p) => p.id));
const substanceIds = new Set(substances.map((s) => s.id));
const cautionIds = new Set(cautions.map((c) => c.id));

// Check condition -> body_system references
for (const cond of conditions) {
  check(systemIds.has(cond.system_id), `Condition ${cond.id} references non-existent body system ${cond.system_id}`);
}

// Check relationship references
const plantConditions = seed.plant_conditions as { plant_id: number; condition_id: number }[];
for (const pc of plantConditions) {
  check(plantIds.has(pc.plant_id), `plant_conditions: plant_id ${pc.plant_id} not found`);
  check(conditionIds.has(pc.condition_id), `plant_conditions: condition_id ${pc.condition_id} not found`);
}

const plantTraditions = seed.plant_traditions as { plant_id: number; tradition_id: number }[];
for (const pt of plantTraditions) {
  check(plantIds.has(pt.plant_id), `plant_traditions: plant_id ${pt.plant_id} not found`);
  check(traditionIds.has(pt.tradition_id), `plant_traditions: tradition_id ${pt.tradition_id} not found`);
}

const plantPreparations = seed.plant_preparations as { plant_id: number; preparation_id: number }[];
for (const pp of plantPreparations) {
  check(plantIds.has(pp.plant_id), `plant_preparations: plant_id ${pp.plant_id} not found`);
  check(prepIds.has(pp.preparation_id), `plant_preparations: preparation_id ${pp.preparation_id} not found`);
}

const plantSubstances = seed.plant_substances as { plant_id: number; substance_id: number }[];
for (const ps of plantSubstances) {
  check(plantIds.has(ps.plant_id), `plant_substances: plant_id ${ps.plant_id} not found`);
  check(substanceIds.has(ps.substance_id), `plant_substances: substance_id ${ps.substance_id} not found`);
}

const plantCautions = seed.plant_cautions as { plant_id: number; caution_id: number }[];
for (const pca of plantCautions) {
  check(plantIds.has(pca.plant_id), `plant_cautions: plant_id ${pca.plant_id} not found`);
  check(cautionIds.has(pca.caution_id), `plant_cautions: caution_id ${pca.caution_id} not found`);
}

const synergies = seed.synergies as { plant_a_id: number; plant_b_id: number }[];
for (const syn of synergies) {
  check(plantIds.has(syn.plant_a_id), `synergies: plant_a_id ${syn.plant_a_id} not found`);
  check(plantIds.has(syn.plant_b_id), `synergies: plant_b_id ${syn.plant_b_id} not found`);
  check(syn.plant_a_id < syn.plant_b_id, `synergies: plant_a_id (${syn.plant_a_id}) should be < plant_b_id (${syn.plant_b_id})`);
}

// Summary
console.log(`\nRelationship counts:`);
console.log(`  Plant-Condition: ${plantConditions.length}`);
console.log(`  Plant-Tradition: ${plantTraditions.length}`);
console.log(`  Plant-Preparation: ${plantPreparations.length}`);
console.log(`  Plant-Substance: ${plantSubstances.length}`);
console.log(`  Plant-Caution: ${plantCautions.length}`);
console.log(`  Synergies: ${synergies.length}`);

// Check that most plants have at least one tradition
const plantsWithTraditions = new Set(plantTraditions.map((pt) => pt.plant_id));
const orphanedPlants = plants.filter((p) => !plantsWithTraditions.has(p.id));
if (orphanedPlants.length > 0) {
  console.log(`\n  Note: ${orphanedPlants.length} plants have no tradition link:`);
  for (const p of orphanedPlants.slice(0, 10)) {
    console.log(`    - ${p.name} (${p.slug})`);
  }
  if (orphanedPlants.length > 10) {
    console.log(`    ... and ${orphanedPlants.length - 10} more`);
  }
}

if (errors > 0) {
  console.error(`\n✗ Validation FAILED with ${errors} error(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ All integrity checks passed`);
}
