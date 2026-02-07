import type {
  SearchResult,
  PlantSummary,
  PlantDetail,
  ConditionDetail,
  BodySystem,
  TraditionSummary,
  TraditionDetail,
  SubstanceDetail,
  GraphData,
} from "./types.js";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function search(query: string, type?: string): Promise<SearchResult[]> {
  const url = new URL("/api/search", window.location.origin);
  url.searchParams.set("q", query);
  if (type) url.searchParams.set("type", type);
  const data = await fetchJSON<{ results: SearchResult[] }>(url.toString());
  return data.results;
}

// ── Plants ──────────────────────────────────────────────────────────────────

export async function getPlants(opts?: {
  tradition?: string;
  system?: string;
  limit?: number;
  offset?: number;
}): Promise<PlantSummary[]> {
  const url = new URL("/api/plants", window.location.origin);
  if (opts?.tradition) url.searchParams.set("tradition", opts.tradition);
  if (opts?.system) url.searchParams.set("system", opts.system);
  if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
  if (opts?.offset) url.searchParams.set("offset", String(opts.offset));
  const data = await fetchJSON<{ plants: PlantSummary[] }>(url.toString());
  return data.plants;
}

export async function getPlant(slug: string): Promise<PlantDetail> {
  return fetchJSON<PlantDetail>(`/api/plants/${encodeURIComponent(slug)}`);
}

// ── Conditions ──────────────────────────────────────────────────────────────

export async function getCondition(slug: string): Promise<ConditionDetail> {
  return fetchJSON<ConditionDetail>(`/api/conditions/${encodeURIComponent(slug)}`);
}

// ── Body Systems ────────────────────────────────────────────────────────────

export async function getSystems(): Promise<BodySystem[]> {
  const data = await fetchJSON<{ systems: BodySystem[] }>("/api/systems");
  return data.systems;
}

// ── Traditions ──────────────────────────────────────────────────────────────

export async function getTraditions(): Promise<TraditionSummary[]> {
  const data = await fetchJSON<{ traditions: TraditionSummary[] }>("/api/traditions");
  return data.traditions;
}

export async function getTradition(slug: string): Promise<TraditionDetail> {
  return fetchJSON<TraditionDetail>(`/api/traditions/${encodeURIComponent(slug)}`);
}

// ── Substances ──────────────────────────────────────────────────────────────

export async function getSubstance(slug: string): Promise<SubstanceDetail> {
  return fetchJSON<SubstanceDetail>(`/api/substances/${encodeURIComponent(slug)}`);
}

// ── Graph ───────────────────────────────────────────────────────────────────

export async function getSynergiesGraph(): Promise<GraphData> {
  return fetchJSON<GraphData>("/api/graph/synergies");
}

export async function getPlantGraph(slug: string): Promise<GraphData> {
  return fetchJSON<GraphData>(`/api/graph/plant/${encodeURIComponent(slug)}`);
}
