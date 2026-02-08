/**
 * parse-compendium.ts
 *
 * Parses the AsciiDoc compendium into structured seed.json.
 * Extracts plants, conditions, body systems, traditions, preparations,
 * substances, cautions, and all relationships.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanAsciiDoc(text: string): string {
  return text
    .replace(/\{plus\}/g, "+")
    .replace(/\{star\}/g, "*")
    .replace(/\{blank\}/g, "")
    .replace(/``"/g, '"')
    .replace(/`"/g, '"')
    .replace(/"\`\`/g, '"')
    .replace(/"`/g, '"')
    .replace(/\+\+<\+\+/g, "<")
    .replace(/\+\+>\+\+/g, ">")
    .replace(/\*([^*]+)\*/g, "$1") // Remove bold markers
    .replace(/\s+/g, " ")
    .trim();
}

// Words that indicate a heading is NOT a plant entry
const NON_PLANT_KEYWORDS = [
  "principles", "approaches", "protocol", "guidelines", "management",
  "combination", "hydration", "traditional", "general", "supportive",
  "dietary", "lifestyle", "care", "hygiene", "nursing", "specific",
  "bone broth", "adaptogens", "seasonal", "herbs generally",
  "topical applications", "cold application", "heat application",
  "summary", "important", "critical", "foundational", "warm olive",
  "onion poultice", "salt and fluid", "hot foot", "cool compress",
  "tepid sponging", "rest and", "baking soda", "omega-3",
  "magnesium-rich", "constitutional", "sleep hygiene", "caution",
  "salt water gargle", "salt water rinse", "steam inhalation",
  "apple cider vinegar", "coconut oil", "coconut water",
  "manuka honey", "eye exercises", "rescue remedy", "bach flower",
  "activated charcoal", "green tea", "oregano oil",
];

function isNonPlantHeading(heading: string): boolean {
  const lower = heading.toLowerCase();
  return NON_PLANT_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractScientific(heading: string): { name: string; scientific: string | null; partUsed: string | null } {
  // Pattern 1: Plant Name (_Scientific name_) — Part/Variant
  const match = heading.match(/^(.+?)\s*\(_([^)]+)_\)\s*(?:—\s*(.+))?$/);
  if (match) {
    let scientific = match[2].trim();
    scientific = scientific.replace(/\s+and related species/i, "").trim();
    return {
      name: match[1].trim(),
      scientific,
      partUsed: match[3]?.trim() || null,
    };
  }
  // Pattern 2: Plant Name (_Scientific name_ and related species) — Part/Variant
  const match1b = heading.match(/^(.+?)\s*\(_([^_]+)_[^)]*\)\s*(?:—\s*(.+))?$/);
  if (match1b) {
    let scientific = match1b[2].trim();
    return {
      name: match1b[1].trim(),
      scientific,
      partUsed: match1b[3]?.trim() || null,
    };
  }
  // Pattern 3: Plant Name (Scientific info) — Part/Variant  (no underscores)
  const match1c = heading.match(/^(.+?)\s*\(([A-Z][a-z]+ [a-z]+[^)]*)\)\s*(?:—\s*(.+))?$/);
  if (match1c) {
    let scientific = match1c[2].trim().replace(/\s+and related species/i, "").trim();
    return {
      name: match1c[1].trim(),
      scientific,
      partUsed: match1c[3]?.trim() || null,
    };
  }
  // Pattern 4: Plant Name — Part/Variant (no scientific)
  const match2 = heading.match(/^(.+?)\s*—\s*(.+)$/);
  if (match2) {
    return { name: match2[1].trim(), scientific: null, partUsed: match2[2].trim() };
  }
  return { name: heading.trim(), scientific: null, partUsed: null };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Plant {
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

interface Condition {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  system_id: number;
}

interface BodySystem {
  id: number;
  slug: string;
  name: string;
  section_num: number;
  description: string | null;
}

interface Tradition {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

interface Preparation {
  id: number;
  slug: string;
  name: string;
  instructions: string | null;
  equipment: string | null;
}

interface Substance {
  id: number;
  slug: string;
  name: string;
  description: string | null;
}

interface Caution {
  id: number;
  slug: string;
  name: string;
  severity: "info" | "warning" | "danger";
  detail: string | null;
}

interface Relation {
  plant_id: number;
  condition_id?: number;
  tradition_id?: number;
  preparation_id?: number;
  substance_id?: number;
  caution_id?: number;
  [key: string]: unknown;
}

interface Synergy {
  plant_a_id: number;
  plant_b_id: number;
  mechanism: string | null;
  effect: string | null;
  tradition: string | null;
}

// ── Known entities ───────────────────────────────────────────────────────────

const KNOWN_TRADITIONS: { name: string; description: string }[] = [
  { name: "Ayurveda", description: "Traditional Indian medicine based on three doshas, six tastes, and energetics. Key texts: Charaka Samhita, Sushruta Samhita, Ashtanga Hridaya." },
  { name: "Unani", description: "Islamic medicine based on four humors and temperaments. Key texts: Ibn Sina's Canon of Medicine, al-Razi's Kitab al-Hawi." },
  { name: "Traditional Chinese Medicine", description: "Medicine based on Yin/Yang, Five Elements, Qi, and meridians. Key texts: Shennong Ben Cao Jing, Huangdi Neijing, Ben Cao Gang Mu." },
  { name: "European Herbalism", description: "Western herbal tradition from Dioscorides' De Materia Medica through modern phytotherapy. Includes folk, astrological, and empirical approaches." },
  { name: "Prophetic Medicine", description: "Faith-based healing from Hadith collections and Ibn Qayyim's Medicine of the Prophet. Emphasizes diet and prevention." },
];

// Aliases that map to the canonical tradition names
const TRADITION_ALIASES: Record<string, string> = {
  ayurveda: "Ayurveda",
  unani: "Unani",
  "unani medicine": "Unani",
  "islamic medicine": "Unani",
  "unani / islamic medicine": "Unani",
  tcm: "Traditional Chinese Medicine",
  "traditional chinese medicine": "Traditional Chinese Medicine",
  "chinese medicine": "Traditional Chinese Medicine",
  european: "European Herbalism",
  "european herbalism": "European Herbalism",
  "western herbalism": "European Herbalism",
  "modern western herbalism": "European Herbalism",
  "modern integrative": "European Herbalism",
  prophetic: "Prophetic Medicine",
  "prophetic medicine": "Prophetic Medicine",
  "tibb al-nabawi": "Prophetic Medicine",
  "middle eastern": "Unani",
  "middle eastern traditional medicine": "Unani",
  "native american": "European Herbalism",
  "american eclectic medicine": "European Herbalism",
  "american folk medicine": "European Herbalism",
  "mediterranean folk medicine": "European Herbalism",
  "european folk medicine": "European Herbalism",
  "south asian folk medicine": "Ayurveda",
  "southeast asian traditional medicine": "Ayurveda",
  "south american traditional medicine": "European Herbalism",
  "african traditional medicine": "European Herbalism",
  homeopathy: "European Herbalism",
  "modern global use": "European Herbalism",
  "modern global adoption": "European Herbalism",
  "native american, adopted into tcm": "Traditional Chinese Medicine",
  "widespread": "European Herbalism",
};

const KNOWN_PREPARATIONS: string[] = [
  "Decoction", "Infusion", "Tincture", "Poultice", "Tea",
  "Powder", "Capsule", "Compress", "Salve", "Oil",
  "Syrup", "Cold Maceration", "Essential Oil", "Steam Inhalation",
  "Cream", "Gargle", "Mouthwash", "Sitz Bath", "Suppository",
  "Juice", "Chewing", "Paste",
];

const KNOWN_CAUTIONS: { name: string; severity: "info" | "warning" | "danger" }[] = [
  { name: "Pregnancy", severity: "danger" },
  { name: "Breastfeeding", severity: "warning" },
  { name: "Blood thinners", severity: "danger" },
  { name: "Blood sugar", severity: "warning" },
  { name: "Blood pressure", severity: "warning" },
  { name: "Liver conditions", severity: "danger" },
  { name: "Kidney conditions", severity: "danger" },
  { name: "Gallstones", severity: "warning" },
  { name: "GERD / Acid reflux", severity: "info" },
  { name: "Children", severity: "warning" },
  { name: "Drug interactions", severity: "danger" },
  { name: "Sedation", severity: "info" },
  { name: "Allergic reactions", severity: "warning" },
  { name: "Photosensitivity", severity: "info" },
  { name: "Surgery", severity: "warning" },
  { name: "Topical use only", severity: "danger" },
  { name: "Short-term use only", severity: "warning" },
  { name: "Estrogenic effects", severity: "warning" },
  { name: "Warming / Heat conditions", severity: "info" },
  { name: "Cooling / Cold conditions", severity: "info" },
  { name: "GI upset", severity: "info" },
  { name: "Heart conditions", severity: "danger" },
  { name: "Autoimmune conditions", severity: "warning" },
  { name: "Thyroid conditions", severity: "warning" },
  { name: "Narrow therapeutic window", severity: "danger" },
];

const CAUTION_KEYWORDS: Record<string, string> = {
  pregnan: "Pregnancy",
  breastfeed: "Breastfeeding",
  lactat: "Breastfeeding",
  "blood thin": "Blood thinners",
  anticoagul: "Blood thinners",
  warfarin: "Blood thinners",
  "blood sugar": "Blood sugar",
  diabet: "Blood sugar",
  hypoglyc: "Blood sugar",
  "blood pressure": "Blood pressure",
  hypotens: "Blood pressure",
  hypertens: "Blood pressure",
  liver: "Liver conditions",
  hepat: "Liver conditions",
  kidney: "Kidney conditions",
  renal: "Kidney conditions",
  gallstone: "Gallstones",
  gallbladder: "Gallstones",
  bile: "Gallstones",
  reflux: "GERD / Acid reflux",
  gerd: "GERD / Acid reflux",
  heartburn: "GERD / Acid reflux",
  child: "Children",
  infant: "Children",
  pediatr: "Children",
  "drug interact": "Drug interactions",
  "medication": "Drug interactions",
  sedat: "Sedation",
  drowsi: "Sedation",
  "do not drive": "Sedation",
  allerg: "Allergic reactions",
  photosensit: "Photosensitivity",
  surgery: "Surgery",
  "topical use only": "Topical use only",
  "topical only": "Topical use only",
  "short-term": "Short-term use only",
  estrogen: "Estrogenic effects",
  warming: "Warming / Heat conditions",
  "hot condition": "Warming / Heat conditions",
  "heat condition": "Warming / Heat conditions",
  cooling: "Cooling / Cold conditions",
  "cold constitution": "Cooling / Cold conditions",
  "gi upset": "GI upset",
  "digestive upset": "GI upset",
  "stomach upset": "GI upset",
  heart: "Heart conditions",
  cardiac: "Heart conditions",
  cardiovascul: "Heart conditions",
  autoimmun: "Autoimmune conditions",
  thyroid: "Thyroid conditions",
  "narrow therapeutic": "Narrow therapeutic window",
};

// Known substances with patterns to detect them
const SUBSTANCE_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: "Curcumin", patterns: [/curcumin/i] },
  { name: "Gingerol", patterns: [/gingerol/i, /shogaol/i] },
  { name: "Allicin", patterns: [/allicin/i] },
  { name: "Eugenol", patterns: [/eugenol/i] },
  { name: "Menthol", patterns: [/menthol/i] },
  { name: "Salicin", patterns: [/salicin/i, /salicylate/i] },
  { name: "Berberine", patterns: [/berberine/i] },
  { name: "Thymol", patterns: [/thymol/i] },
  { name: "Rosmarinic acid", patterns: [/rosmarinic/i] },
  { name: "Carvacrol", patterns: [/carvacrol/i] },
  { name: "Quercetin", patterns: [/quercetin/i] },
  { name: "Kaempferol", patterns: [/kaempferol/i] },
  { name: "Luteolin", patterns: [/luteolin/i] },
  { name: "Apigenin", patterns: [/apigenin/i] },
  { name: "Mucilage", patterns: [/mucilage/i] },
  { name: "Tannins", patterns: [/\btannin/i] },
  { name: "Volatile oils", patterns: [/volatile oil/i, /essential oil compound/i] },
  { name: "Saponins", patterns: [/saponin/i] },
  { name: "Alkaloids", patterns: [/\balkaloid/i] },
  { name: "Flavonoids", patterns: [/flavonoid/i] },
  { name: "Glycyrrhizin", patterns: [/glycyrrhiz/i] },
  { name: "Silymarin", patterns: [/silymarin/i] },
  { name: "Withanolides", patterns: [/withanolide/i] },
  { name: "Boswellic acids", patterns: [/boswellic/i] },
  { name: "Harpagosides", patterns: [/harpagoside/i] },
  { name: "Valerenic acid", patterns: [/valerenic/i] },
  { name: "Piperine", patterns: [/piperine/i] },
  { name: "Capsaicin", patterns: [/capsaicin/i] },
  { name: "Catechins", patterns: [/catechin/i] },
  { name: "Anthocyanins", patterns: [/anthocyanin/i] },
  { name: "Proanthocyanidins", patterns: [/proanthocyanidin/i] },
  { name: "Inulin", patterns: [/\binulin/i] },
  { name: "Beta-glucans", patterns: [/beta-glucan/i, /β-glucan/i] },
  { name: "Allantoin", patterns: [/allantoin/i] },
  { name: "Hypericin", patterns: [/hypericin/i] },
  { name: "Hyperforin", patterns: [/hyperforin/i] },
  { name: "Ginkgolides", patterns: [/ginkgolide/i] },
  { name: "Bilobalide", patterns: [/bilobalide/i] },
  { name: "Chamazulene", patterns: [/chamazulene/i] },
  { name: "Bisabolol", patterns: [/bisabolol/i] },
  { name: "Aucubin", patterns: [/aucubin/i] },
  { name: "Arbutin", patterns: [/arbutin/i] },
  { name: "Ellagic acid", patterns: [/ellagic/i] },
  { name: "Cinnamaldehyde", patterns: [/cinnamaldehyde/i] },
  { name: "Anethole", patterns: [/anethole/i] },
  { name: "Parthenolide", patterns: [/parthenolide/i] },
  { name: "Petasin", patterns: [/petasin/i] },
  { name: "Kavalactones", patterns: [/kavalactone/i] },
  { name: "Resveratrol", patterns: [/resveratrol/i] },
  { name: "Oleuropein", patterns: [/oleuropein/i] },
  { name: "Ephedrine", patterns: [/ephedrine/i] },
  { name: "Aconitine", patterns: [/aconitine/i] },
  { name: "Ricin", patterns: [/\bricin\b/i] },
  { name: "Podophyllotoxin", patterns: [/podophyllotoxin/i] },
  { name: "Cineole", patterns: [/cineole/i, /eucalyptol/i] },
  { name: "Linalool", patterns: [/linalool/i] },
  { name: "Baicalin", patterns: [/baicalin/i, /baicalein/i] },
];

// ── Parser ───────────────────────────────────────────────────────────────────

class CompendiumParser {
  private lines: string[];
  private plants: Map<string, Plant> = new Map(); // slug -> Plant
  private plantNameToSlug: Map<string, string> = new Map(); // lowercase name -> slug
  private conditions: Map<string, Condition> = new Map();
  private bodySystems: Map<string, BodySystem> = new Map();
  private traditions: Map<string, Tradition> = new Map();
  private preparations: Map<string, Preparation> = new Map();
  private substances: Map<string, Substance> = new Map();
  private cautions: Map<string, Caution> = new Map();

  private plantConditions: Set<string> = new Set(); // "plantId-conditionId"
  private plantTraditions: Set<string> = new Set();
  private plantPreparations: Map<string, string | null> = new Map(); // "plantId-prepId" -> instructions
  private plantSubstances: Set<string> = new Set();
  private plantCautions: Map<string, string | null> = new Map();
  private synergies: Synergy[] = [];

  private nextPlantId = 1;
  private nextConditionId = 1;
  private nextSystemId = 1;
  private nextTraditionId = 1;
  private nextPrepId = 1;
  private nextSubstanceId = 1;
  private nextCautionId = 1;

  constructor(content: string) {
    this.lines = content.split("\n");
    this.initTraditions();
    this.initPreparations();
    this.initCautions();
  }

  private initTraditions() {
    for (const t of KNOWN_TRADITIONS) {
      const slug = slugify(t.name);
      this.traditions.set(slug, {
        id: this.nextTraditionId++,
        slug,
        name: t.name,
        description: t.description,
      });
    }
  }

  private initPreparations() {
    for (const name of KNOWN_PREPARATIONS) {
      const slug = slugify(name);
      this.preparations.set(slug, {
        id: this.nextPrepId++,
        slug,
        name,
        instructions: null,
        equipment: null,
      });
    }
  }

  private initCautions() {
    for (const c of KNOWN_CAUTIONS) {
      const slug = slugify(c.name);
      this.cautions.set(slug, {
        id: this.nextCautionId++,
        slug,
        name: c.name,
        severity: c.severity,
        detail: null,
      });
    }
  }

  private findOrCreatePlant(name: string, scientific: string | null, partUsed: string | null): Plant {
    // Clean the name — remove trailing qualifiers like "Essential Oil", "Extract"
    let cleanName = name.replace(/\s+Essential Oil$/i, "").replace(/\s+Extract$/i, "").replace(/\s+Paste$/i, "").trim();

    const slug = slugify(cleanName);
    if (this.plants.has(slug)) {
      const existing = this.plants.get(slug)!;
      if (scientific && !existing.scientific) existing.scientific = scientific;
      if (partUsed && !existing.part_used) existing.part_used = partUsed;
      return existing;
    }

    // Try to match by scientific name
    if (scientific) {
      const sciLower = scientific.toLowerCase();
      for (const [, plant] of this.plants) {
        if (plant.scientific && plant.scientific.toLowerCase() === sciLower) {
          // Same scientific name — merge
          this.plantNameToSlug.set(cleanName.toLowerCase(), plant.slug);
          if (partUsed && !plant.part_used) plant.part_used = partUsed;
          return plant;
        }
      }
    }

    // Try to match by name substring (e.g., "Lavender" matches "Lavender Essential Oil")
    const nameLower = cleanName.toLowerCase();
    for (const [existingSlug, plant] of this.plants) {
      const existingLower = plant.name.toLowerCase();
      if (existingLower === nameLower || existingLower.startsWith(nameLower + " ") || nameLower.startsWith(existingLower + " ")) {
        this.plantNameToSlug.set(cleanName.toLowerCase(), existingSlug);
        if (scientific && !plant.scientific) plant.scientific = scientific;
        return plant;
      }
    }

    const plant: Plant = {
      id: this.nextPlantId++,
      slug,
      name: cleanName,
      scientific,
      alt_names: [],
      description: null,
      historical: null,
      part_used: partUsed,
      image_url: null,
    };
    this.plants.set(slug, plant);
    this.plantNameToSlug.set(cleanName.toLowerCase(), slug);
    if (scientific) this.plantNameToSlug.set(scientific.toLowerCase(), slug);
    return plant;
  }

  private findPlantByName(name: string): Plant | undefined {
    let cleaned = name.replace(/\*/g, "").replace(/\s+Essential Oil$/i, "").replace(/\s+Extract$/i, "").replace(/\s+Paste$/i, "").trim();
    const slug = slugify(cleaned);
    if (this.plants.has(slug)) return this.plants.get(slug);

    const lower = cleaned.toLowerCase();
    if (this.plantNameToSlug.has(lower)) return this.plants.get(this.plantNameToSlug.get(lower)!);

    // Try partial matching — plant name should be a word-boundary match
    for (const [, p] of this.plants) {
      const pLower = p.name.toLowerCase();
      if (pLower === lower || lower.startsWith(pLower) || pLower.startsWith(lower)) {
        return p;
      }
    }
    return undefined;
  }

  private resolveTradition(raw: string): Tradition | undefined {
    const lower = raw.toLowerCase().trim();
    const mapped = TRADITION_ALIASES[lower];
    if (mapped) {
      const slug = slugify(mapped);
      return this.traditions.get(slug);
    }
    // Try partial match
    for (const [alias, canonical] of Object.entries(TRADITION_ALIASES)) {
      if (lower.includes(alias) || alias.includes(lower)) {
        return this.traditions.get(slugify(canonical));
      }
    }
    return undefined;
  }

  private getOrCreateSubstance(name: string): Substance {
    const slug = slugify(name);
    if (this.substances.has(slug)) return this.substances.get(slug)!;
    const sub: Substance = {
      id: this.nextSubstanceId++,
      slug,
      name,
      description: null,
    };
    this.substances.set(slug, sub);
    return sub;
  }

  // ── Main parse ─────────────────────────────────────────────────────────────

  parse() {
    console.log("Parsing compendium...");
    this.parseSections();
    this.parseAppendixF();
    this.parseSynergyTables();
    console.log(`  Plants:       ${this.plants.size}`);
    console.log(`  Conditions:   ${this.conditions.size}`);
    console.log(`  Body Systems: ${this.bodySystems.size}`);
    console.log(`  Traditions:   ${this.traditions.size}`);
    console.log(`  Preparations: ${this.preparations.size}`);
    console.log(`  Substances:   ${this.substances.size}`);
    console.log(`  Cautions:     ${this.cautions.size}`);
    console.log(`  Synergies:    ${this.synergies.length}`);
    console.log(`  Plant-Condition links: ${this.plantConditions.size}`);
    console.log(`  Plant-Tradition links: ${this.plantTraditions.size}`);
  }

  // ── Parse Sections 1-13 ───────────────────────────────────────────────────

  private parseSections() {
    const sectionRegex = /^== Section (\d+): (.+)$/;
    const subsectionRegex = /^=== (\d+\.\d+) (.+)$/;
    const plantHeadingRegex = /^==== (.+)$/;

    let currentSystem: BodySystem | undefined;
    let currentCondition: Condition | undefined;
    let i = 0;

    while (i < this.lines.length) {
      const line = this.lines[i];

      // Detect section (body system)
      const sectionMatch = line.match(sectionRegex);
      if (sectionMatch) {
        const sectionNum = parseInt(sectionMatch[1]);
        const name = sectionMatch[2].trim();
        const slug = slugify(name);

        // Get description from next non-empty lines
        let desc = "";
        let j = i + 1;
        while (j < this.lines.length && !this.lines[j].match(/^===/) && !this.lines[j].match(/^==/)) {
          if (this.lines[j].trim() && !this.lines[j].startsWith("____") && !this.lines[j].startsWith("'''''")) {
            if (desc) desc += " ";
            desc += cleanAsciiDoc(this.lines[j]);
          }
          j++;
          if (desc.length > 300) break;
        }

        currentSystem = {
          id: this.nextSystemId++,
          slug,
          name,
          section_num: sectionNum,
          description: desc || null,
        };
        this.bodySystems.set(slug, currentSystem);
        i++;
        continue;
      }

      // Detect subsection (condition)
      const subsectionMatch = line.match(subsectionRegex);
      if (subsectionMatch && currentSystem) {
        const name = subsectionMatch[2].trim();
        const slug = slugify(`${subsectionMatch[1]}-${name}`);

        // Get description from next non-empty, non-heading lines
        let desc = "";
        let j = i + 1;
        while (j < this.lines.length && !this.lines[j].match(/^====/) && !this.lines[j].match(/^===\s/)) {
          const trimmed = this.lines[j].trim();
          if (trimmed && !trimmed.startsWith("'''''") && !trimmed.startsWith("____")) {
            if (desc) desc += " ";
            desc += cleanAsciiDoc(trimmed);
          }
          j++;
          if (desc.length > 300) break;
        }

        currentCondition = {
          id: this.nextConditionId++,
          slug,
          name,
          description: desc || null,
          system_id: currentSystem.id,
        };
        this.conditions.set(slug, currentCondition);
        i++;
        continue;
      }

      // Detect plant heading within a section
      const plantMatch = line.match(plantHeadingRegex);
      if (plantMatch && currentCondition && currentSystem) {
        const headingText = plantMatch[1].trim();

        // Skip non-plant headings
        if (isNonPlantHeading(headingText)) {
          i++;
          continue;
        }

        // Has scientific name in italics — definitely a plant
        if (headingText.includes("(_") && headingText.includes("_)")) {
          const parsed = extractScientific(headingText);
          const plant = this.findOrCreatePlant(parsed.name, parsed.scientific, parsed.partUsed);

          // Link plant to condition
          const key = `${plant.id}-${currentCondition.id}`;
          this.plantConditions.add(key);

          // Parse the entry body
          i = this.parsePlantEntry(plant, i + 1);
          continue;
        } else {
          // No scientific name — check for cross-references or known plants
          const cleanedHeading = headingText.replace(/\*/g, "").trim();
          const nextLines = this.lines.slice(i + 1, i + 5).join(" ");

          if (nextLines.includes("See detailed entry") || nextLines.includes("See entry in")) {
            // Cross-reference — find existing plant by name
            const parsed = extractScientific(cleanedHeading);
            const existingPlant = this.findPlantByName(parsed.name);
            if (existingPlant) {
              const key = `${existingPlant.id}-${currentCondition.id}`;
              this.plantConditions.add(key);
            }
          } else if (nextLines.includes("*Also Known As:*") || nextLines.includes("*Traditions:*")) {
            // Has plant-like fields — treat as a plant entry
            const parsed = extractScientific(cleanedHeading);
            const plant = this.findOrCreatePlant(parsed.name, parsed.scientific, parsed.partUsed);
            const key = `${plant.id}-${currentCondition.id}`;
            this.plantConditions.add(key);
            i = this.parsePlantEntry(plant, i + 1);
            continue;
          }
          // Otherwise skip — it's a non-plant heading
        }
      }

      // Stop parsing sections after Section 13 / before Appendix
      if (line.startsWith("== Appendix") || line.startsWith("== Plant Compatibility")) {
        break;
      }

      i++;
    }
  }

  private parsePlantEntry(plant: Plant, startLine: number): number {
    let i = startLine;
    let currentField: string | null = null;
    let fieldContent = "";

    const flushField = () => {
      if (!currentField || !fieldContent.trim()) return;
      const content = cleanAsciiDoc(fieldContent);

      switch (currentField) {
        case "also_known_as":
          plant.alt_names = content.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          break;
        case "traditions":
          this.parseTraditions(plant, content);
          break;
        case "historical":
          plant.historical = content;
          break;
        case "preparations":
          this.parsePreparationMethods(plant, fieldContent);
          break;
        case "application":
          if (!plant.description) plant.description = content;
          break;
        case "cautions":
          this.parseCautionText(plant, fieldContent);
          break;
      }

      // Detect substances in all text
      this.detectSubstances(plant, fieldContent);
    };

    while (i < this.lines.length) {
      const line = this.lines[i];

      // Stop at next plant heading, section, subsection
      if (line.match(/^====\s/) || line.match(/^===\s/) || line.match(/^==\s/)) {
        flushField();
        return i;
      }

      // Detect field headers
      if (line.includes("*Also Known As:*")) {
        flushField();
        currentField = "also_known_as";
        fieldContent = line.replace(/.*\*Also Known As:\*\s*/, "");
        i++;
        continue;
      }
      if (line.includes("*Traditions:*")) {
        flushField();
        currentField = "traditions";
        fieldContent = line.replace(/.*\*Traditions:\*\s*/, "");
        i++;
        continue;
      }
      if (line.includes("*Historical Note:*")) {
        flushField();
        currentField = "historical";
        fieldContent = line.replace(/.*\*Historical Note:\*\s*/, "");
        i++;
        continue;
      }
      if (line.includes("*Preparation Methods:*") || line.includes("*Preparation:*")) {
        flushField();
        currentField = "preparations";
        fieldContent = "";
        i++;
        continue;
      }
      if (line.includes("*Application:*") || line.includes("*Application*")) {
        flushField();
        currentField = "application";
        fieldContent = line.replace(/.*\*Application:?\*\s*/, "");
        i++;
        continue;
      }
      if (line.includes("*Cautions:*") || line.includes("*Caution:*")) {
        flushField();
        currentField = "cautions";
        fieldContent = line.replace(/.*\*Cautions?:\*\s*/, "");
        i++;
        continue;
      }
      if (line.includes("*Availability:*")) {
        flushField();
        currentField = null; // We don't store availability
        i++;
        continue;
      }

      // Separator — end of entry
      if (line.trim() === "'''''" && currentField) {
        flushField();
        return i + 1;
      }

      // Accumulate field content
      if (currentField) {
        fieldContent += "\n" + line;
      }

      i++;
    }

    flushField();
    return i;
  }

  private parseTraditions(plant: Plant, text: string) {
    const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const tradition = this.resolveTradition(part);
      if (tradition) {
        const key = `${plant.id}-${tradition.id}`;
        this.plantTraditions.add(key);
      }
    }
  }

  private parsePreparationMethods(plant: Plant, text: string) {
    const prepPatterns: Record<string, RegExp> = {
      decoction: /decoction/i,
      infusion: /infusion/i,
      tincture: /tincture/i,
      poultice: /poultice/i,
      tea: /\btea\b/i,
      powder: /powder/i,
      capsule: /capsule/i,
      compress: /compress/i,
      salve: /salve/i,
      oil: /\boil\b/i,
      syrup: /syrup/i,
      "cold-maceration": /cold (?:maceration|infusion|soak)/i,
      "essential-oil": /essential oil/i,
      "steam-inhalation": /steam (?:inhalation|inhale)/i,
      cream: /cream/i,
      gargle: /gargle/i,
      mouthwash: /mouthwash/i,
      juice: /juice/i,
      chewing: /chew/i,
      paste: /paste/i,
    };

    for (const [slug, pattern] of Object.entries(prepPatterns)) {
      if (pattern.test(text)) {
        const prep = this.preparations.get(slug);
        if (prep) {
          const key = `${plant.id}-${prep.id}`;
          if (!this.plantPreparations.has(key)) {
            this.plantPreparations.set(key, null);
          }
        }
      }
    }
  }

  private parseCautionText(plant: Plant, text: string) {
    const lower = text.toLowerCase();
    for (const [keyword, cautionName] of Object.entries(CAUTION_KEYWORDS)) {
      if (lower.includes(keyword)) {
        const slug = slugify(cautionName);
        const caution = this.cautions.get(slug);
        if (caution) {
          const key = `${plant.id}-${caution.id}`;
          if (!this.plantCautions.has(key)) {
            this.plantCautions.set(key, null);
          }
        }
      }
    }
  }

  private detectSubstances(plant: Plant, text: string) {
    for (const sp of SUBSTANCE_PATTERNS) {
      for (const pattern of sp.patterns) {
        if (pattern.test(text)) {
          const sub = this.getOrCreateSubstance(sp.name);
          const key = `${plant.id}-${sub.id}`;
          this.plantSubstances.add(key);
          break;
        }
      }
    }
  }

  // ── Parse Appendix F ──────────────────────────────────────────────────────

  private parseAppendixF() {
    const startIdx = this.lines.findIndex((l) => l.startsWith("== Appendix F:"));
    if (startIdx === -1) {
      console.warn("  Warning: Appendix F not found");
      return;
    }

    const plantHeadingRegex = /^=== (.+)$/;
    let i = startIdx;

    while (i < this.lines.length) {
      const line = this.lines[i];

      // Stop at next top-level section
      if (i > startIdx && (line.startsWith("== ") && !line.startsWith("=== "))) {
        break;
      }

      const match = line.match(plantHeadingRegex);
      if (match && i > startIdx + 10) { // Skip the introductory === headings
        const plantName = match[1].trim();

        // Skip non-plant headings in the index preamble
        if (["How to Use This Index", "Index Statistics", "How to Find What You Need"].includes(plantName)) {
          i++;
          continue;
        }

        // Skip non-plant entries
        if (isNonPlantHeading(plantName)) {
          i++;
          continue;
        }

        // Gather the entry block
        let entryText = "";
        let j = i + 1;
        while (j < this.lines.length && !this.lines[j].match(/^===\s/) && !this.lines[j].match(/^==\s/)) {
          entryText += this.lines[j] + "\n";
          j++;
        }

        this.processAppendixFEntry(plantName, entryText);
        i = j;
        continue;
      }

      i++;
    }
  }

  private processAppendixFEntry(name: string, text: string) {
    // Extract scientific name
    const sciMatch = text.match(/\*Scientific Name:\*\s*_([^_]+)_/);
    const scientific = sciMatch ? sciMatch[1].trim() : null;

    // Extract alt names
    const altMatch = text.match(/\*Alternative Names?:\*\s*(.+?)(?:\n|\*Traditions)/s);
    const altNames = altMatch
      ? altMatch[1].split(/[,;]/).map((s) => cleanAsciiDoc(s).trim()).filter(Boolean)
      : [];

    // Extract part used
    const partMatch = text.match(/\*Plant Part\/Variant:\*\s*(.+)/);
    const partUsed = partMatch ? cleanAsciiDoc(partMatch[1]) : null;

    // Find or create plant
    const plant = this.findOrCreatePlant(name, scientific, partUsed);
    if (altNames.length > 0 && plant.alt_names.length === 0) {
      plant.alt_names = altNames;
    }

    // Extract traditions
    const tradMatch = text.match(/\*Traditions:\*\s*(.+)/);
    if (tradMatch) {
      this.parseTraditions(plant, cleanAsciiDoc(tradMatch[1]));
    }

    // Extract primary uses as description
    const usesMatch = text.match(/\*Primary Uses:\*\s*(.+?)(?:\*Key Cautions|$)/s);
    if (usesMatch && !plant.description) {
      plant.description = cleanAsciiDoc(usesMatch[1]);
    }

    // Extract cautions
    const cautionMatch = text.match(/\*Key Cautions:\*\s*(.+)/s);
    if (cautionMatch) {
      this.parseCautionText(plant, cautionMatch[1]);
    }

    // Extract mentioned sections and link to conditions
    const mentionedMatch = text.match(/\*Mentioned In:\*\s*(.+)/);
    if (mentionedMatch) {
      const sections = mentionedMatch[1].match(/Section (\d+)/g);
      if (sections) {
        for (const secRef of sections) {
          const secNum = parseInt(secRef.replace("Section ", ""));
          // Find body system by section number
          for (const sys of this.bodySystems.values()) {
            if (sys.section_num === secNum) {
              // Link to first condition in this system if no specific condition
              for (const cond of this.conditions.values()) {
                if (cond.system_id === sys.id) {
                  const key = `${plant.id}-${cond.id}`;
                  if (!this.plantConditions.has(key)) {
                    // Only add if we don't already have a link to any condition in this system
                    const hasLinkInSystem = Array.from(this.plantConditions).some((k) => {
                      const [pid] = k.split("-");
                      return pid === String(plant.id) && Array.from(this.conditions.values()).some(
                        (c) => c.id === parseInt(k.split("-")[1]) && c.system_id === sys.id
                      );
                    });
                    if (!hasLinkInSystem) {
                      this.plantConditions.add(key);
                    }
                  }
                  break;
                }
              }
              break;
            }
          }
        }
      }
    }

    // Detect substances
    this.detectSubstances(plant, text);
  }

  // ── Parse synergy tables ──────────────────────────────────────────────────

  private parseSynergyTables() {
    const startIdx = this.lines.findIndex((l) => l.includes("Synergistic Combinations"));
    if (startIdx === -1) {
      console.warn("  Warning: Synergy tables not found");
      return;
    }

    // Find all table rows
    const tableRowRegex = /^\|(.+)$/;
    let i = startIdx;
    const endIdx = this.lines.findIndex((l, idx) => idx > startIdx && l.startsWith("=== Synergic Scope"));
    const end = endIdx === -1 ? this.lines.length : endIdx;

    let inTable = false;
    let isHeaderRow = false;

    while (i < end) {
      const line = this.lines[i].trim();

      if (line === "|===") {
        inTable = !inTable;
        isHeaderRow = inTable; // First row after |=== is header
        i++;
        continue;
      }

      if (inTable && line.startsWith("|") && !isHeaderRow) {
        // Parse table row: |Combination |Ratio |Synergic Effect |Mechanism |Traditions
        const cells = line.split("|").filter(Boolean).map((c) => cleanAsciiDoc(c.trim()));
        if (cells.length >= 3) {
          const combo = cells[0];
          const effect = cells[2] || null;
          const mechanism = cells.length >= 5 ? (cells[3] || null) : null;
          const tradition = cells.length >= 5 ? cells[4] : (cells.length >= 4 ? cells[3] : null);

          // Extract plant names from combination
          const plantNames = this.extractPlantNamesFromCombo(combo);
          if (plantNames.length >= 2) {
            // Create pairwise synergies
            for (let a = 0; a < plantNames.length; a++) {
              for (let b = a + 1; b < plantNames.length; b++) {
                const plantA = this.findPlantByName(plantNames[a]);
                const plantB = this.findPlantByName(plantNames[b]);
                if (plantA && plantB) {
                  const [lowId, highId] = plantA.id < plantB.id
                    ? [plantA.id, plantB.id]
                    : [plantB.id, plantA.id];

                  // Check for duplicates
                  const exists = this.synergies.some(
                    (s) => s.plant_a_id === lowId && s.plant_b_id === highId
                  );
                  if (!exists) {
                    this.synergies.push({
                      plant_a_id: lowId,
                      plant_b_id: highId,
                      mechanism,
                      effect,
                      tradition,
                    });
                  }
                }
              }
            }
          }
        }
      }

      if (isHeaderRow && line.startsWith("|")) {
        isHeaderRow = false;
      }

      i++;
    }
  }

  private extractPlantNamesFromCombo(combo: string): string[] {
    // Remove parenthetical notes
    let cleaned = combo.replace(/\([^)]*\)/g, "").trim();
    // Split on + or "and"
    const parts = cleaned.split(/\s*\+\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    return parts;
  }

  // ── Build output ──────────────────────────────────────────────────────────

  buildSeed() {
    return {
      plants: Array.from(this.plants.values()),
      conditions: Array.from(this.conditions.values()),
      body_systems: Array.from(this.bodySystems.values()),
      traditions: Array.from(this.traditions.values()),
      preparations: Array.from(this.preparations.values()),
      substances: Array.from(this.substances.values()),
      cautions: Array.from(this.cautions.values()),
      plant_conditions: Array.from(this.plantConditions).map((key) => {
        const [plantId, condId] = key.split("-").map(Number);
        return { plant_id: plantId, condition_id: condId, dosage: null, notes: null };
      }),
      plant_traditions: Array.from(this.plantTraditions).map((key) => {
        const [plantId, tradId] = key.split("-").map(Number);
        return { plant_id: plantId, tradition_id: tradId, historical_note: null };
      }),
      plant_preparations: Array.from(this.plantPreparations.entries()).map(([key, instructions]) => {
        const [plantId, prepId] = key.split("-").map(Number);
        return { plant_id: plantId, preparation_id: prepId, instructions };
      }),
      plant_substances: Array.from(this.plantSubstances).map((key) => {
        const [plantId, subId] = key.split("-").map(Number);
        return { plant_id: plantId, substance_id: subId, part_used: null };
      }),
      plant_cautions: Array.from(this.plantCautions.entries()).map(([key, detail]) => {
        const [plantId, cautionId] = key.split("-").map(Number);
        return { plant_id: plantId, caution_id: cautionId, detail };
      }),
      synergies: this.synergies,
    };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const compendiumPath = resolve(__dirname, "../doc/natures-pharmacy-compendium.adoc");
const outputPath = resolve(__dirname, "seed.json");

console.log(`Reading compendium from: ${compendiumPath}`);
const content = readFileSync(compendiumPath, "utf-8");

const parser = new CompendiumParser(content);
parser.parse();
const seed = parser.buildSeed();

writeFileSync(outputPath, JSON.stringify(seed, null, 2), "utf-8");
console.log(`\nSeed data written to: ${outputPath}`);
console.log(`  File size: ${(Buffer.byteLength(JSON.stringify(seed)) / 1024).toFixed(1)} KB`);
