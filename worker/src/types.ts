/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
}

/** Database row types */
export interface PlantRow {
  id: number;
  slug: string;
  name: string;
  scientific: string | null;
  alt_names: string | null; // JSON array string
  description: string | null;
  historical: string | null;
  part_used: string | null;
  image_url: string | null;
}

export interface ConditionRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  system_id: number;
}

export interface BodySystemRow {
  id: number;
  slug: string;
  name: string;
  section_num: number;
  description: string | null;
}

export interface TraditionRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

export interface PreparationRow {
  id: number;
  slug: string;
  name: string;
  instructions: string | null;
  equipment: string | null;
}

export interface SubstanceRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

export interface CautionRow {
  id: number;
  slug: string;
  name: string;
  severity: "info" | "warning" | "danger";
  detail: string | null;
}

export interface SynergyRow {
  plant_a_id: number;
  plant_b_id: number;
  mechanism: string | null;
  effect: string | null;
  tradition: string | null;
}

export interface SearchResult {
  entity_type: string;
  entity_slug: string;
  name: string;
  excerpt: string;
}

/** API response types */
export interface PlantDetail extends Omit<PlantRow, "alt_names"> {
  alt_names: string[];
  conditions: { slug: string; name: string; system: string; dosage: string | null }[];
  traditions: { slug: string; name: string }[];
  preparations: { slug: string; name: string; instructions: string | null }[];
  substances: { slug: string; name: string }[];
  cautions: { slug: string; name: string; severity: string; detail: string | null }[];
  synergies: { slug: string; name: string; scientific: string | null; effect: string | null; mechanism: string | null; tradition: string | null }[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "plant" | "condition" | "tradition" | "substance";
  group: string;
  size: number;
  meta: Record<string, string>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "synergy" | "treats" | "used_in" | "contains";
  label?: string;
  weight: number;
}
