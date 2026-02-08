/** Frontend types — mirrors worker/src/types.ts for API responses */

export interface Reference {
  id: number;
  authors: string;
  title: string;
  journal: string;
  year: number;
  url: string;
}

export interface SearchResult {
  entity_type: string;
  entity_slug: string;
  name: string;
  excerpt: string;
}

export interface PlantSummary {
  id: number;
  slug: string;
  name: string;
  scientific: string | null;
  alt_names: string[];
  description: string | null;
  historical: string | null;
  part_used: string | null;
  image_url: string | null;
}

export interface PlantDetail extends PlantSummary {
  conditions: { slug: string; name: string; system: string; dosage: string | null }[];
  traditions: { slug: string; name: string }[];
  preparations: { slug: string; name: string; instructions: string | null }[];
  substances: { slug: string; name: string; refs: Reference[] | null }[];
  cautions: { slug: string; name: string; severity: string; detail: string | null; refs: Reference[] | null }[];
  synergies: { slug: string; name: string; scientific: string | null; effect: string | null; mechanism: string | null; tradition: string | null; refs: Reference[] | null }[];
}

export interface ConditionDetail {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  system_id: number;
  system_name: string;
  system_slug: string;
  plants: {
    slug: string;
    name: string;
    scientific: string | null;
    description: string | null;
    dosage: string | null;
    notes: string | null;
  }[];
}

export interface BodySystem {
  id: number;
  slug: string;
  name: string;
  section_num: number;
  description: string | null;
  condition_count: number;
}

export interface TraditionSummary {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  plant_count: number;
}

export interface TraditionDetail {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  plants: {
    slug: string;
    name: string;
    scientific: string | null;
    description: string | null;
  }[];
}

export interface SubstanceDetail {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  refs: Reference[] | null;
  plants: {
    slug: string;
    name: string;
    scientific: string | null;
    description: string | null;
  }[];
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
  source: string | GraphNode;
  target: string | GraphNode;
  type: "synergy" | "treats" | "used_in" | "contains";
  label?: string;
  weight: number;
}
