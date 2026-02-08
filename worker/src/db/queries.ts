/**
 * Prepared D1 query helpers.
 */

import type {
  PlantRow, ConditionRow, BodySystemRow, TraditionRow,
  PreparationRow, SubstanceRow, CautionRow, SynergyRow,
} from "../types.js";

// ── Plants ───────────────────────────────────────────────────────────────────

export async function getAllPlants(db: D1Database, opts?: {
  tradition?: string;
  system?: string;
  limit?: number;
  offset?: number;
}) {
  let sql = `SELECT DISTINCT p.* FROM plants p`;
  const params: string[] = [];
  const joins: string[] = [];
  const wheres: string[] = [];

  if (opts?.tradition) {
    joins.push(`JOIN plant_traditions pt ON p.id = pt.plant_id JOIN traditions t ON pt.tradition_id = t.id`);
    wheres.push(`t.slug = ?`);
    params.push(opts.tradition);
  }
  if (opts?.system) {
    joins.push(`JOIN plant_conditions pc ON p.id = pc.plant_id JOIN conditions c ON pc.condition_id = c.id JOIN body_systems bs ON c.system_id = bs.id`);
    wheres.push(`bs.slug = ?`);
    params.push(opts.system);
  }

  sql += " " + joins.join(" ");
  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  sql += ` ORDER BY p.name`;
  if (opts?.limit) {
    sql += ` LIMIT ?`;
    params.push(String(opts.limit));
  }
  if (opts?.offset) {
    sql += ` OFFSET ?`;
    params.push(String(opts.offset));
  }

  return db.prepare(sql).bind(...params).all<PlantRow>();
}

export async function getPlantBySlug(db: D1Database, slug: string) {
  return db.prepare(`SELECT * FROM plants WHERE slug = ?`).bind(slug).first<PlantRow>();
}

export async function getPlantConditions(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT c.slug, c.name, bs.name as system, pc.dosage
    FROM plant_conditions pc
    JOIN conditions c ON pc.condition_id = c.id
    JOIN body_systems bs ON c.system_id = bs.id
    WHERE pc.plant_id = ?
    ORDER BY bs.section_num, c.name
  `).bind(plantId).all<{ slug: string; name: string; system: string; dosage: string | null }>();
}

export async function getPlantTraditions(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT t.slug, t.name
    FROM plant_traditions pt
    JOIN traditions t ON pt.tradition_id = t.id
    WHERE pt.plant_id = ?
    ORDER BY t.name
  `).bind(plantId).all<{ slug: string; name: string }>();
}

export async function getPlantPreparations(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT pr.slug, pr.name, pp.instructions
    FROM plant_preparations pp
    JOIN preparations pr ON pp.preparation_id = pr.id
    WHERE pp.plant_id = ?
    ORDER BY pr.name
  `).bind(plantId).all<{ slug: string; name: string; instructions: string | null }>();
}

export async function getPlantSubstances(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT s.slug, s.name, s.refs
    FROM plant_substances ps
    JOIN substances s ON ps.substance_id = s.id
    WHERE ps.plant_id = ?
    ORDER BY s.name
  `).bind(plantId).all<{ slug: string; name: string; refs: string | null }>();
}

export async function getPlantCautions(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT ca.slug, ca.name, ca.severity, COALESCE(pca.detail, ca.detail) as detail, ca.refs
    FROM plant_cautions pca
    JOIN cautions ca ON pca.caution_id = ca.id
    WHERE pca.plant_id = ?
    ORDER BY CASE ca.severity WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, ca.name
  `).bind(plantId).all<{ slug: string; name: string; severity: string; detail: string | null; refs: string | null }>();
}

export async function getPlantSynergies(db: D1Database, plantId: number) {
  return db.prepare(`
    SELECT p.slug, p.name, p.scientific, s.effect, s.mechanism, s.tradition, s.refs
    FROM synergies s
    JOIN plants p ON (CASE WHEN s.plant_a_id = ? THEN s.plant_b_id ELSE s.plant_a_id END) = p.id
    WHERE s.plant_a_id = ? OR s.plant_b_id = ?
  `).bind(plantId, plantId, plantId).all<{ slug: string; name: string; scientific: string | null; effect: string | null; mechanism: string | null; tradition: string | null; refs: string | null }>();
}

// ── Conditions ───────────────────────────────────────────────────────────────

export async function getConditionBySlug(db: D1Database, slug: string) {
  return db.prepare(`
    SELECT c.*, bs.name as system_name, bs.slug as system_slug
    FROM conditions c
    JOIN body_systems bs ON c.system_id = bs.id
    WHERE c.slug = ?
  `).bind(slug).first<ConditionRow & { system_name: string; system_slug: string }>();
}

export async function getConditionPlants(db: D1Database, conditionId: number) {
  return db.prepare(`
    SELECT p.slug, p.name, p.scientific, p.description, pc.dosage, pc.notes
    FROM plant_conditions pc
    JOIN plants p ON pc.plant_id = p.id
    WHERE pc.condition_id = ?
    ORDER BY p.name
  `).bind(conditionId).all();
}

// ── Body Systems ─────────────────────────────────────────────────────────────

export async function getAllSystems(db: D1Database) {
  return db.prepare(`
    SELECT bs.*, COUNT(c.id) as condition_count
    FROM body_systems bs
    LEFT JOIN conditions c ON c.system_id = bs.id
    GROUP BY bs.id
    ORDER BY bs.section_num
  `).all<BodySystemRow & { condition_count: number }>();
}

// ── Traditions ───────────────────────────────────────────────────────────────

export async function getAllTraditions(db: D1Database) {
  return db.prepare(`
    SELECT t.*, COUNT(pt.plant_id) as plant_count
    FROM traditions t
    LEFT JOIN plant_traditions pt ON pt.tradition_id = t.id
    GROUP BY t.id
    ORDER BY t.name
  `).all<TraditionRow & { plant_count: number }>();
}

export async function getTraditionBySlug(db: D1Database, slug: string) {
  return db.prepare(`SELECT * FROM traditions WHERE slug = ?`).bind(slug).first<TraditionRow>();
}

export async function getTraditionPlants(db: D1Database, traditionId: number) {
  return db.prepare(`
    SELECT p.slug, p.name, p.scientific, p.description
    FROM plant_traditions pt
    JOIN plants p ON pt.plant_id = p.id
    WHERE pt.tradition_id = ?
    ORDER BY p.name
  `).bind(traditionId).all();
}

// ── Substances ───────────────────────────────────────────────────────────────

export async function getSubstanceBySlug(db: D1Database, slug: string) {
  return db.prepare(`SELECT * FROM substances WHERE slug = ?`).bind(slug).first<SubstanceRow>();
}

export async function getSubstancePlants(db: D1Database, substanceId: number) {
  return db.prepare(`
    SELECT p.slug, p.name, p.scientific, p.description
    FROM plant_substances ps
    JOIN plants p ON ps.plant_id = p.id
    WHERE ps.substance_id = ?
    ORDER BY p.name
  `).bind(substanceId).all();
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function search(db: D1Database, query: string, type?: string) {
  let sql = `
    SELECT entity_type, entity_slug, name,
           snippet(search_index, 5, '<mark>', '</mark>', '...', 32) as excerpt
    FROM search_index
    WHERE search_index MATCH ?
  `;
  const params: string[] = [query + "*"];

  if (type) {
    sql += ` AND entity_type = ?`;
    params.push(type);
  }

  sql += ` ORDER BY rank LIMIT 20`;

  return db.prepare(sql).bind(...params).all();
}

// ── Graph ────────────────────────────────────────────────────────────────────

export async function getAllSynergies(db: D1Database) {
  return db.prepare(`
    SELECT s.*, pa.slug as slug_a, pa.name as name_a, pa.scientific as sci_a,
           pb.slug as slug_b, pb.name as name_b, pb.scientific as sci_b
    FROM synergies s
    JOIN plants pa ON s.plant_a_id = pa.id
    JOIN plants pb ON s.plant_b_id = pb.id
  `).all();
}

export async function getPlantEgoNetwork(db: D1Database, plantId: number) {
  // Get the plant itself, its synergies, conditions, and traditions
  const [synergies, conditions, traditions] = await Promise.all([
    getPlantSynergies(db, plantId),
    getPlantConditions(db, plantId),
    getPlantTraditions(db, plantId),
  ]);
  return { synergies, conditions, traditions };
}
