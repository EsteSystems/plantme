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

interface Reference {
  id: number;
  authors: string;
  title: string;
  journal: string;
  year: number;
  url: string;
}

interface Substance {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  refs: Reference[] | null;
}

interface Caution {
  id: number;
  slug: string;
  name: string;
  severity: "info" | "warning" | "danger";
  detail: string | null;
  refs: Reference[] | null;
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
  refs: Reference[] | null;
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
  { name: "Thymoquinone", patterns: [/thymoquinone/i] },
  { name: "Anthraquinones", patterns: [/anthraquinone/i, /\bemodin\b/i] },
  { name: "Tartaric acid", patterns: [/tartaric/i] },
  { name: "Diosgenin", patterns: [/diosgenin/i] },
  { name: "Isothiocyanates", patterns: [/isothiocyanate/i, /sulforaphane/i] },
  { name: "Protodioscin", patterns: [/protodioscin/i] },
  { name: "Arjunolic acid", patterns: [/arjunolic/i, /arjunin/i] },
];

// Substance descriptions: chemistry, effects, and preparation transformations
const SUBSTANCE_DESCRIPTIONS: Record<string, string> = {
  "Gingerol":
    "Phenolic ketone found in fresh ginger rhizome. Primary bioactive: 6-gingerol is a potent 5-HT3 receptor antagonist (anti-emetic) [1] and COX-2 inhibitor [2]. Drying converts gingerols to shogaols (2× more pungent, stronger anti-inflammatory) and zingerone (less pungent, retains anti-nausea activity) [3]. Boiling partially degrades gingerols but produces dehydrated gingerdiols with antioxidant activity. Alcohol tincture preserves gingerols effectively. Fermentation (as in ginger beer) reduces gingerol content significantly.",

  "Allicin":
    "Thiosulfinate compound produced when garlic cloves are crushed or chopped, via alliinase acting on alliin. Extremely unstable — half-life ~16 hours at 23°C [3]. Potent broad-spectrum antimicrobial that disrupts bacterial membranes via thiol-disulfide exchange [1]. Cooking rapidly destroys allicin; even 60 seconds of microwaving eliminates most activity [2]. Drying preserves alliin (the precursor) but not allicin itself. Alcohol tincture of fresh garlic captures some allicin but it degrades to diallyl disulfide and ajoene (anti-thrombotic). Crushing and waiting 10 minutes before cooking maximizes allicin formation. Fermented black garlic contains S-allyl cysteine instead — a stable, bioavailable antioxidant with different pharmacology.",

  "Eugenol":
    "Phenylpropanoid found in clove buds, holy basil, and cinnamon leaf oil. Strong COX-2 inhibitor [1] and local anaesthetic — numbs tissue on contact via sodium channel blockade [2]. Also potent antimicrobial against both gram-positive and gram-negative bacteria [3]. Heat-stable: survives boiling and decoction well. Alcohol extracts eugenol efficiently (>90% recovery in tincture). Drying concentrates eugenol as water evaporates. Oxidation converts eugenol to eugenol oxide and dieugenol, which are less bioactive. In clove oil, eugenol comprises 72–90% of volatile fraction.",

  "Curcumin":
    "Diarylheptanoid polyphenol responsible for turmeric's yellow color. Inhibits NF-κB [1], COX-2, and LOX — broad anti-inflammatory. Extremely poor oral bioavailability (<1%) due to rapid hepatic glucuronidation and intestinal metabolism [3]. Piperine (black pepper) increases absorption ~2000% by inhibiting glucuronidation [2]. Lipids enhance absorption via micellar solubilization. Boiling in water extracts only ~10% of curcumin; simmering in fat/oil extracts much more. Alcohol tincture is effective for extraction. Drying preserves curcumin well. Heat degrades curcumin above 180°C into vanillin, ferulic acid, and feruloylmethane — all mildly anti-inflammatory but less potent.",

  "Menthol":
    "Cyclic monoterpene alcohol from peppermint oil. Activates TRPM8 cold receptors producing cooling sensation [1]. Antispasmodic on GI smooth muscle via calcium channel blockade [2] — basis of enteric-coated peppermint oil capsules for IBS. Volatile: boiling drives off menthol rapidly (peppermint tea should be steeped covered, not boiled). Drying reduces menthol content by 20–40%. Alcohol tincture preserves menthol effectively. Topically acts as counterirritant and mild local anaesthetic. Metabolized hepatically to menthol glucuronide.",

  "Salicin":
    "Phenolic glucoside found in willow bark, meadowsweet, and poplar. Prodrug: converted by gut flora and liver to salicylic acid (the active metabolite, same as aspirin's mechanism) [1]. Inhibits COX-1 and COX-2 but with slower onset and longer duration than aspirin [2]. Boiling/decoction extracts salicin effectively — traditional willow bark tea. Alcohol tincture also extracts well. Drying preserves salicin. Unlike aspirin, salicin does not acetylate platelets irreversibly, so anti-platelet effect is weaker. Meadowsweet's tannins buffer the gastric irritation that pure salicylates cause.",

  "Berberine":
    "Isoquinoline alkaloid found in goldenseal, Oregon grape, and barberry. Bright yellow color. Activates AMPK pathway — improves insulin sensitivity and glucose metabolism [1][2]. Antimicrobial against bacteria, fungi, and protozoa. Poor oral bioavailability (~5%) due to P-glycoprotein efflux in gut [3]. Heat-stable: survives decoction. Alcohol tincture extracts berberine efficiently (it is soluble in ethanol). Drying preserves berberine well. Synergistic with 5′-methoxyhydnocarpin (found in same plants), which inhibits bacterial efflux pumps.",

  "Thymol":
    "Monoterpene phenol found in thyme and oregano. Potent antimicrobial — disrupts bacterial cell membranes [1] and inhibits biofilm formation [2]. Also acts as bronchospasmolytic, relaxing airway smooth muscle [3]. Moderately volatile: boiling drives off some thymol (cover tea while steeping). Drying reduces thymol content somewhat. Alcohol tincture extracts and preserves thymol very effectively. Used in commercial mouthwash (Listerine) at ~0.06%. Heating above 230°C decomposes thymol. Synergistic with carvacrol (its isomer) — together more antimicrobial than either alone.",

  "Rosmarinic acid":
    "Phenolic acid ester found in rosemary, lemon balm, sage, holy basil, and many Lamiaceae. Inhibits GABA-transaminase, increasing synaptic GABA levels (anxiolytic) [1]. Also inhibits complement activation (anti-inflammatory) [2] and has strong antioxidant activity (ORAC value higher than vitamin E). Water-soluble: extracts well in tea/decoction. Heat-stable up to ~150°C. Alcohol tincture preserves it effectively. Drying preserves rosmarinic acid well — dried herbs retain most activity. Not significantly degraded by fermentation.",

  "Volatile oils":
    "Complex mixtures of terpenes, terpenoids, and phenylpropanoids responsible for plant aromas and many therapeutic effects. Composition varies enormously by species — may include monoterpenes (linalool, limonene), sesquiterpenes, or phenolics (eugenol, thymol). Generally antimicrobial, antispasmodic, and carminative. Highly sensitive to heat: boiling drives off most volatile compounds within minutes. Teas should be steeped covered, never boiled. Drying reduces volatile oil content 30–70% depending on method and temperature. Alcohol tincture is the best preservation method — ethanol dissolves and stabilizes most volatiles. Steam distillation isolates essential oils. Cold-pressed oils retain full volatile profile.",

  "Tannins":
    "Polyphenolic compounds that bind and precipitate proteins. Two major classes: hydrolyzable (gallotannins, ellagitannins) and condensed (proanthocyanidins). Astringent — tighten tissues, reduce secretions, protect mucous membranes. Antimicrobial by denaturing bacterial surface proteins. Water-soluble: extract well in hot water (longer steeping = more tannins). Boiling extracts maximum tannins. Drying concentrates tannins. Alcohol tincture extracts tannins efficiently. Excessive tannin intake can impair iron absorption by chelating dietary iron. Fermentation (as in tea processing) oxidizes catechins into theaflavins and thearubigins — different polyphenols with distinct activity.",

  "Mucilage":
    "High-molecular-weight polysaccharides that form viscous gel when hydrated. Found in marshmallow root, psyllium, aloe, mullein, plantain. Demulcent: coats and soothes irritated mucous membranes. Also prebiotic — fermented by gut flora into short-chain fatty acids. Extracted best in cold or lukewarm water (cold infusion overnight). Hot water works but excessive heat can denature polysaccharide structure. Alcohol destroys mucilage — tinctures are NOT appropriate for mucilage-rich herbs. Drying preserves mucilage precursors; rehydration restores gel-forming capacity. Boiling for extended periods can break down mucilage chains.",

  "Alkaloids":
    "Nitrogen-containing organic compounds with potent pharmacological activity. Diverse class including isoquinolines (berberine), tropanes (atropine), and pyrrolizidines (toxic). Generally bitter-tasting. Most are well-extracted by alcohol (alkaloids are bases, soluble in acidified ethanol). Water extraction (tea/decoction) is less efficient but still viable for many alkaloids. Heat-stable in general — survive boiling. Drying preserves alkaloid content well. Some alkaloids (e.g., pyrrolizidine) are hepatotoxic and concentrate with drying. Dose-dependent: many alkaloids are medicinal at low doses, toxic at high doses. Fermentation may alter alkaloid profiles.",

  "Flavonoids":
    "Large class of polyphenolic compounds (>6000 known). Subclasses include flavones (apigenin, luteolin), flavonols (quercetin, kaempferol), flavanones, isoflavones, and anthocyanins. Generally antioxidant, anti-inflammatory, and vasoprotective. Many modulate enzyme activity (COX, LOX, xanthine oxidase). Water-soluble glycosides extract in tea; aglycones extract better in alcohol. Heat-stable: survive boiling well. Drying preserves most flavonoids. Fermentation can cleave glycoside bonds, releasing free aglycones (generally more bioactive but less water-soluble). UV exposure can degrade some flavonoids — store dried herbs away from light.",

  "Saponins":
    "Triterpene or steroidal glycosides that foam when shaken in water (Latin sapo = soap). Found in ginseng (ginsenosides), astragalus (astragalosides), licorice, fenugreek, horse chestnut. Amphiphilic: interact with cell membranes, enhancing absorption of other compounds. Some are adaptogenic (ginsenosides), others are expectorant (by irritating bronchial mucosa reflexively). Well-extracted by boiling/decoction — traditional method for hard roots. Alcohol tincture also effective. Drying preserves saponins well. Hemolytic if injected IV but safe orally (poorly absorbed intact). Gut bacteria hydrolyze saponin glycosides into aglycones (sapogenins) with distinct pharmacology.",

  "Glycyrrhizin":
    "Triterpene saponin from licorice root, 50× sweeter than sucrose. Inhibits 11β-hydroxysteroid dehydrogenase type 2 [1], increasing cortisol activity — anti-inflammatory but can cause pseudoaldosteronism (hypertension, hypokalemia) with chronic high-dose use [2]. Also antiviral (inhibits viral penetration and replication) [3]. Well-extracted by boiling — traditional decoction herb. Alcohol tincture effective. Drying preserves glycyrrhizin. DGL (deglycyrrhizinated licorice) has glycyrrhizin removed to avoid mineralocorticoid side effects while retaining mucosal-protective flavonoids.",

  "Silymarin":
    "Flavonolignan complex from milk thistle seeds, comprising silybin (most active), silydianin, and silychristin. Potent hepatoprotective: stabilizes hepatocyte membranes [3], stimulates ribosomal RNA polymerase (promoting liver cell regeneration) [1], and scavenges free radicals [2]. Poorly water-soluble — tea extracts only ~10% of silymarin. Alcohol tincture extracts significantly more. Standardized extracts (70–80% silymarin) are most clinically effective. Drying preserves silymarin. Heat-stable up to ~160°C. Phosphatidylcholine complexes (phytosomes) dramatically improve oral bioavailability.",

  "Withanolides":
    "Steroidal lactones unique to ashwagandha (Withania somnifera). Withaferin A and withanolide D are most studied. Modulate HPA axis — normalize cortisol under chronic stress (adaptogenic) [1]. Also inhibit NF-κB (anti-inflammatory) [2] and enhance GABAergic signaling (anxiolytic) [3]. Lipophilic: poorly extracted by water alone. Traditional Ayurvedic preparation simmers ashwagandha in milk (fat enhances extraction). Alcohol tincture extracts withanolides effectively. Drying preserves withanolides well — root is typically used dried and powdered. Heat-stable under normal cooking temperatures.",

  "Boswellic acids":
    "Pentacyclic triterpene acids from Boswellia serrata resin (frankincense). AKBA (acetyl-11-keto-β-boswellic acid) is the most potent — selectively inhibits 5-lipoxygenase [1][2], reducing leukotriene synthesis. Also inhibits topoisomerase and NF-κB [3]. Lipophilic: poorly water-soluble. Alcohol tincture extracts boswellic acids moderately. Best administered as standardized extract or with lipid vehicles. Drying preserves boswellic acids (resin is naturally dry). Heat does not significantly degrade them. Traditional use burns resin as incense — inhalation delivers some volatile terpenes but not the non-volatile boswellic acids.",

  "Harpagosides":
    "Iridoid glycosides from devil's claw (Harpagophytum procumbens) tuber. Anti-inflammatory via COX-2 [1] and TNF-α inhibition [2]. Also analgesic — used for joint pain and back pain. Heat-sensitive: boiling degrades harpagosides significantly. Water extraction (cold or warm infusion) is traditional. Alcohol tincture preserves harpagosides well. Drying at low temperature preserves activity; high-temperature drying degrades them. Gastric acid can partially hydrolyze the glycoside bond, but harpagosides are absorbed intact in the duodenum. Standardized extracts typically contain 2–3% harpagosides.",

  "Valerenic acid":
    "Sesquiterpene acid found in valerian root. Positive allosteric modulator of GABA-A receptors [1] — enhances GABA binding without acting as a direct agonist (unlike benzodiazepines). Anxiolytic and sedative without morning grogginess. Also inhibits GABA breakdown by inhibiting GABA-transaminase [2]. Moderately volatile: some loss during boiling. Alcohol tincture is the preferred extraction method — ethanol extracts valerenic acid efficiently. Drying at room temperature preserves it; heat-drying above 40°C causes significant loss. Fresh root has more isovaleric acid (the distinctive odor) but dried root has more valerenic acid (concentration effect). Standardized extracts contain 0.8–1% valerenic acid.",

  "Piperine":
    "Alkaloid responsible for black pepper's pungency. Potent bioenhancer: inhibits hepatic and intestinal glucuronidation (UGT enzymes), CYP3A4, and P-glycoprotein efflux pumps [1] — dramatically increasing bioavailability of co-administered compounds (curcumin +2000% [2], CoQ10 +30%). Also activates TRPV1 receptors (thermogenic). Heat-stable: survives cooking temperatures. Drying preserves piperine. Alcohol tincture extracts piperine effectively. Caution: piperine's enzyme inhibition can increase blood levels of pharmaceutical drugs (similar mechanism to grapefruit juice).",

  "Capsaicin":
    "Vanilloid compound responsible for chili pepper heat. Binds TRPV1 receptors on C-fiber nociceptors [1] — initial activation causes burning pain, but prolonged exposure depletes substance P, producing analgesia [2] (basis of capsaicin cream for neuropathic pain [3]). Thermogenic: increases metabolic rate via sympathetic activation. Heat-stable: survives all cooking temperatures. Drying concentrates capsaicin — dried cayenne is more potent than fresh. Alcohol tincture extracts capsaicin efficiently (cayenne tincture). Not significantly water-soluble — oil or alcohol are better solvents. Scoville heat units measure capsaicin content. Dihydrocapsaicin (found alongside capsaicin) has similar but slightly less potent activity.",

  "Catechins":
    "Flavan-3-ol polyphenols, primarily from tea (Camellia sinensis). EGCG (epigallocatechin gallate) is most studied — antioxidant, anti-inflammatory, thermogenic [2], and anti-angiogenic [1]. Green tea preserves catechins (unoxidized); black tea fermentation converts catechins to theaflavins and thearubigins (different activity profile). Hot water extraction at 70–80°C is optimal — boiling water degrades EGCG. Drying preserves catechins if done quickly. Alcohol tincture extracts catechins well. Adding lemon juice (vitamin C) stabilizes catechins in solution. Milk proteins bind catechins, reducing bioavailability.",

  "Anthocyanins":
    "Water-soluble vacuolar pigments (red, purple, blue) found in elderberry, bilberry, hibiscus, and many berries. Antioxidant and anti-inflammatory — inhibit NF-κB and COX-2 [1]. Also antiviral: elderberry anthocyanins inhibit viral neuraminidase [2]. pH-dependent color: red in acid, blue in alkaline, colorless at neutral pH. Heat-sensitive: boiling degrades anthocyanins 20–50% depending on duration. Drying causes some loss but freeze-drying preserves well. Alcohol tincture preserves anthocyanins effectively (acidified ethanol is best). Fermentation (as in wine) preserves some anthocyanins but converts others to pyranoanthocyanins. Rapid oral absorption but short plasma half-life (~2 hours).",

  "Proanthocyanidins":
    "Oligomeric and polymeric flavan-3-ols (condensed tannins). Found in cranberry, grape seed, pine bark, hawthorn. Cranberry A-type PACs specifically prevent E. coli adhesion to uroepithelium (UTI prevention) [1][2] — B-type PACs (grape, pine bark) do not share this activity. Strong antioxidant (ORAC values exceed vitamin C and E). Vasoprotective: strengthen capillary walls, reduce edema [3]. Water-soluble: extract in tea. Heat-stable. Alcohol tincture extracts effectively. Drying preserves proanthocyanidins well. Polymerization increases with storage — very large polymers are poorly absorbed.",

  "Inulin":
    "Fructo-oligosaccharide (prebiotic fiber) found in chicory root, dandelion root, and elecampane. Not digested by human enzymes — fermented by Bifidobacterium and Lactobacillus in the colon [1], producing short-chain fatty acids (butyrate, propionate) that nourish colonocytes and reduce pH. Enhances calcium and magnesium absorption [2]. Water-soluble: extracts well in hot water. Heat converts inulin to shorter-chain fructooligosaccharides (still prebiotic). Roasting (as in chicory coffee substitute) caramelizes inulin. Drying preserves inulin. Alcohol does not extract inulin efficiently. Excessive intake can cause flatulence and bloating.",

  "Beta-glucans":
    "Polysaccharides with β-glycosidic bonds, found in medicinal mushrooms (reishi, lion's mane, shiitake) and oats. β-1,3/1,6-glucans (fungal) activate innate immune system via Dectin-1 receptors on macrophages and dendritic cells [1][2] — immunomodulatory, not immunostimulant. Oat β-1,3/1,4-glucans lower cholesterol by binding bile acids. Require hot water extraction (decoction) to break chitin cell walls of mushrooms. Alcohol alone does NOT extract beta-glucans. Dual extraction (hot water + alcohol) captures both beta-glucans and triterpenes. Drying preserves beta-glucans. Not degraded by normal cooking temperatures.",

  "Allantoin":
    "Diureide of glyoxylic acid found in comfrey (Symphytum). Promotes cell proliferation and wound healing by stimulating fibroblast activity and increasing extracellular matrix synthesis [1]. Also moisturizing and keratolytic (softens skin). Water-soluble: extracts in tea or poultice. Heat-stable. Alcohol tincture extracts allantoin moderately. Drying preserves allantoin. Used topically for wound healing, burns, and ulcers. Note: comfrey also contains hepatotoxic pyrrolizidine alkaloids — topical use is preferred over internal use. Synthetic allantoin is widely used in commercial skincare.",

  "Hypericin":
    "Naphthodianthrone pigment from St. John's wort (Hypericum perforatum). Photosensitizer: absorbs UV light and generates reactive oxygen species [1] — basis of both phototoxicity risk and potential photodynamic therapy applications. Antiviral activity against enveloped viruses [2]. Contributes to antidepressant effect along with hyperforin. Water extraction (tea) yields some hypericin. Alcohol tincture extracts hypericin efficiently — standardized extracts typically contain 0.3% hypericin. Light-sensitive: degrades with UV exposure (store tinctures in dark bottles). Drying in shade preserves hypericin; sun-drying degrades it. Oil infusions (St. John's wort oil) turn red from hypericin extraction into lipids.",

  "Hyperforin":
    "Phloroglucinol derivative from St. John's wort. Primary antidepressant compound: inhibits reuptake of serotonin, norepinephrine, dopamine, GABA, and glutamate via TRPC6 channel activation [1] — unique multi-transmitter mechanism. Also antibacterial (active against MRSA) [2]. Extremely unstable: oxidizes rapidly when exposed to light and air. Alcohol tincture must be made from fresh plant and stored in dark, airtight bottles. Drying causes significant hyperforin loss unless done rapidly in darkness. Not well-extracted by water. CO2 supercritical extraction is the gold standard for stable hyperforin. Standardized extracts aim for 3–5% hyperforin. Potent CYP3A4 inducer — causes drug interactions [3].",

  "Ginkgolides":
    "Diterpene trilactones unique to Ginkgo biloba. Ginkgolide B is the most pharmacologically active — potent and specific antagonist of platelet-activating factor (PAF) [1], reducing platelet aggregation and improving microcirculation. Also neuroprotective via anti-inflammatory and antioxidant mechanisms [2]. Heat-stable: survive decoction (traditional Chinese preparation). Alcohol tincture extracts ginkgolides efficiently. Standardized extract (EGb 761) contains 6% terpene trilactones (ginkgolides + bilobalide). Drying preserves ginkgolides well — leaves are typically dried before extraction. Not significantly degraded by fermentation.",

  "Bilobalide":
    "Sesquiterpene trilactone unique to Ginkgo biloba. Neuroprotective: preserves mitochondrial function during ischemia [1], inhibits glycine receptor-mediated neurotoxicity, and reduces cerebral edema [2]. Works synergistically with ginkgolides for cognitive benefits. Similar extraction and stability profile to ginkgolides — heat-stable, well-extracted by alcohol, preserved by drying. Standardized ginkgo extracts typically contain ~3% bilobalide. Crosses the blood-brain barrier. More potent neuroprotectant than ginkgolides in animal stroke models.",

  "Chamazulene":
    "Sesquiterpene not present in fresh chamomile — formed during steam distillation from matricin (a sesquiterpene lactone) via heat-induced decomposition [2]. Gives chamomile essential oil its characteristic blue color. Potent anti-inflammatory: inhibits leukotriene B4 synthesis [1] and reduces histamine release. Present in steam-distilled oil but NOT in water infusions (tea) or alcohol tinctures — these contain matricin instead, which is also anti-inflammatory but less potent. Drying preserves matricin (the precursor). Topical application of chamomile oil delivers chamazulene directly. Degrades with prolonged light exposure.",

  "Bisabolol":
    "Monocyclic sesquiterpene alcohol found in chamomile essential oil. Anti-inflammatory (inhibits COX-2) [1], wound-healing [2], and antimicrobial. Unlike chamazulene, bisabolol IS present in the fresh plant. Moderately volatile: some loss during boiling (steep covered). Alcohol tincture preserves bisabolol well. Drying causes moderate loss of bisabolol. Steam distillation recovers bisabolol efficiently. Used in commercial skincare for its anti-irritant properties. α-bisabolol is the naturally occurring enantiomer and is more active than synthetic racemic bisabolol.",

  "Aucubin":
    "Iridoid glycoside found in plantain (Plantago), eyebright, and mullein. Anti-inflammatory, hepatoprotective, and antimicrobial [1]. Converted by gut bacteria to aucubigenin (the active aglycone), which is more potent. Water-soluble: extracts well in tea and decoctions. Heat partially stable — short boiling is fine, prolonged heating degrades it. Alcohol tincture extracts aucubin efficiently. Drying at low temperature preserves aucubin; high-heat drying causes degradation. Fresh plantain poultice delivers aucubin directly to wounds. Also has neuroprotective properties in animal models [2].",

  "Arbutin":
    "Hydroquinone glucoside found in uva-ursi (bearberry), cranberry, and pear. Prodrug: hydrolyzed by gut bacteria to hydroquinone [1], which is excreted in urine as an antimicrobial [2] — active against E. coli and other urinary pathogens. Requires alkaline urine (pH >8) for optimal antibacterial activity — traditionally taken with sodium bicarbonate. Water-soluble: extracts well in tea. Heat-stable. Alcohol tincture also effective. Drying preserves arbutin well. Urine must be alkaline for hydroquinone to remain un-ionized and bactericidal. Short-term use recommended due to theoretical hydroquinone toxicity concerns with chronic use.",

  "Ellagic acid":
    "Phenolic compound found in raspberry, pomegranate, strawberry, and walnut. Potent antioxidant: scavenges free radicals and chelates metal ions. Anti-proliferative: induces apoptosis in abnormal cells via p53 activation [1]. Gut bacteria convert ellagic acid to urolithins (A, B, C), which have distinct anti-inflammatory and anti-aging properties [2] — urolithin production varies between individuals based on microbiome composition. Moderately water-soluble. Heat-stable: survives boiling and jam-making. Drying preserves ellagic acid. Alcohol tincture extracts it efficiently. Concentrated in seeds and peel rather than fruit flesh.",

  "Cinnamaldehyde":
    "Phenylpropanoid aldehyde responsible for cinnamon's flavor and aroma. Antimicrobial: disrupts bacterial quorum sensing and biofilm formation [2]. Also improves insulin sensitivity via AMPK activation and GLUT4 translocation [1]. Moderately volatile: some loss with boiling, but enough survives in cinnamon tea to be bioactive. Alcohol tincture extracts cinnamaldehyde very effectively. Drying preserves it well (cinnamon bark is used dried). Cassia cinnamon contains more cinnamaldehyde than Ceylon cinnamon but also more coumarin (hepatotoxic at high doses). Oxidation converts cinnamaldehyde to cinnamic acid (less bioactive). Oil of cinnamon is 65–80% cinnamaldehyde.",

  "Anethole":
    "Phenylpropanoid ether responsible for the sweet licorice-like flavor of fennel, anise, and star anise. Antispasmodic on GI smooth muscle via calcium channel modulation [1]. Also estrogenic activity (structural similarity to catecholamines and dopamine) [2]. Carminative: reduces intestinal gas. Volatile: partially lost during boiling (fennel tea should be steeped covered). Alcohol tincture preserves anethole well. Drying causes moderate anethole loss. Trans-anethole is the naturally occurring, bioactive isomer; cis-anethole is toxic but rarely found naturally. Not significantly altered by fermentation. Fennel seed is 80–90% anethole by essential oil composition.",

  "Parthenolide":
    "Sesquiterpene lactone from feverfew (Tanacetum parthenium). Primary mechanism: inhibits NF-κB by alkylating cysteine residues [1], reducing production of pro-inflammatory cytokines (TNF-α, IL-1). Also inhibits platelet aggregation and serotonin release from platelets [2] — basis of migraine prevention use. Unstable: degrades significantly during drying, especially with heat. Fresh plant or freeze-dried preparations are most potent. Alcohol tincture from fresh herb preserves parthenolide better than dried preparations. Boiling degrades parthenolide substantially. Standardized extracts aim for 0.2–0.4% parthenolide. Chewing fresh leaves is the traditional (though bitter) delivery method.",

  "Petasin":
    "Sesquiterpene ester from butterbur (Petasites hybridus). Antispasmodic: relaxes smooth muscle in bronchi and blood vessels. Used for migraine prevention and allergic rhinitis (comparable efficacy to cetirizine in clinical trials) [2]. Inhibits leukotriene synthesis and calcium channel influx [1]. Raw butterbur contains hepatotoxic pyrrolizidine alkaloids (PAs) — only PA-free standardized extracts (like Petadolex) are safe. Boiling does NOT remove PAs. Alcohol tincture does not remove PAs. Only industrial CO2 extraction reliably removes PAs while preserving petasin. Drying does not affect petasin stability significantly.",

  "Kavalactones":
    "Lipophilic lactones from kava root (Piper methysticum), including kavain, dihydrokavain, methysticin, and yangonin. Anxiolytic: potentiate GABA-A receptors [1], block voltage-gated sodium channels [2], inhibit MAO-B [3], and modulate cannabinoid CB1 receptors — multi-target mechanism. Traditional preparation: cold water extraction of fresh root (knead root in water). Alcohol tincture extracts kavalactones efficiently but may extract hepatotoxic compounds not present in water extract. Boiling degrades some kavalactones. Drying preserves kavalactones well. Traditional fermentation is not typically applied to kava. Noble cultivars contain mainly kavain and dihydrokavain (desirable anxiolytics); tudei cultivars contain more dihydromethysticin (more sedating, potentially hepatotoxic).",

  "Resveratrol":
    "Stilbene polyphenol found in grape skin, Japanese knotweed, and peanuts. Activates SIRT1 (sirtuin) — implicated in longevity and metabolic health [1]. Anti-inflammatory via NF-κB and COX-2 inhibition. Antioxidant and cardioprotective. Low oral bioavailability (~1%) due to rapid hepatic sulfation and glucuronidation [2]. Red wine contains resveratrol (fermentation extracts it from grape skins), but amounts are modest. Alcohol tincture of Japanese knotweed is a concentrated source. Heat-stable under normal conditions. Drying preserves resveratrol. Trans-resveratrol is the bioactive form; UV light isomerizes it to less-active cis-resveratrol.",

  "Oleuropein":
    "Secoiridoid glycoside from olive leaf and fruit. Potent antioxidant: scavenges superoxide and hydroxyl radicals. Antihypertensive via ACE inhibition and calcium channel blockade [1]. Also antimicrobial and antiviral. Bitter taste contributes to olive flavor (removed during olive curing). Water-soluble: extracts well in tea. Alcohol tincture also effective. Drying preserves oleuropein well. Hydrolyzed by gut bacteria and esterases to hydroxytyrosol (also potently antioxidant and cardioprotective) [2]. During olive oil processing, oleuropein is partially converted to oleacein. Fermentation (olive brining) degrades oleuropein — cured olives contain much less than fresh leaves.",

  "Ephedrine":
    "Phenethylamine alkaloid from Ephedra (Ma Huang). Sympathomimetic: stimulates release of norepinephrine from sympathetic neurons [1][2]. Bronchodilator (β2-adrenergic activation), decongestant (α-adrenergic vasoconstriction), CNS stimulant, thermogenic. Heat-stable: traditional Chinese decoction method is effective. Alcohol tincture extracts ephedrine efficiently. Drying preserves ephedrine well — dried herb is the standard form. Pseudoephedrine (stereoisomer) has similar decongestant but less CNS stimulant activity. Cardiovascular risks: hypertension, arrhythmia, stroke at high doses. Regulated substance in many jurisdictions due to use as methamphetamine precursor.",

  "Cineole":
    "Bicyclic monoterpene ether (also called eucalyptol or 1,8-cineole). Found in eucalyptus, tea tree, cardamom, rosemary, and bay laurel. Mucolytic: thins respiratory mucus by reducing mucin production. Bronchodilatory via anti-inflammatory action (inhibits TNF-α, IL-1β) [1][2]. Also antimicrobial against respiratory pathogens. Volatile: significantly lost during boiling — steam inhalation captures cineole effectively. Alcohol tincture preserves cineole well. Drying causes 30–50% cineole loss. Absorbed through skin and lungs as well as GI tract. Hepatically metabolized to 2-hydroxycineole. Well-tolerated at normal doses; large doses of isolated eucalyptus oil can cause seizures.",

  "Linalool":
    "Monoterpene alcohol found in lavender, coriander, basil, and many aromatic plants. Anxiolytic: modulates glutamate binding at NMDA receptors (not via GABA) [1]. Also anti-inflammatory (inhibits LPS-induced NF-κB) [2] and local anaesthetic. Readily absorbed via inhalation — basis of lavender aromatherapy for anxiety and sleep. Volatile: partially lost during boiling. Alcohol tincture preserves linalool well. Drying causes 20–40% linalool loss. S-(+)-linalool (lavender) and R-(-)-linalool (coriander) are enantiomers with similar but not identical pharmacology. Metabolized hepatically to linalool oxide. Used widely in perfumery and cosmetics.",

  "Baicalin":
    "Flavone glycoside found in skullcap (Scutellaria baicalensis and S. lateriflora). Anti-inflammatory: inhibits 12/15-lipoxygenase [1] and COX-2. Also antiviral (inhibits viral replication), neuroprotective (reduces excitotoxicity), and anxiolytic (binds benzodiazepine site on GABA-A receptors) [2]. Hydrolyzed by gut bacteria to baicalein (aglycone) [3], which crosses the blood-brain barrier more readily. Water-soluble: extracts well in decoction (traditional Chinese method). Alcohol tincture also effective. Drying preserves baicalin. Heat-stable. Chinese skullcap root contains much higher baicalin levels than American skullcap (which acts more via flavonoids and diterpenes).",

  "Kaempferol":
    "Flavonol found in moringa, witch hazel, ginkgo, tea, and many fruits and vegetables. Structurally similar to quercetin with one fewer hydroxyl group. Anti-inflammatory: inhibits COX-2, iNOS, and NF-κB [1]. Antioxidant: scavenges superoxide and peroxynitrite. Also neuroprotective and cardioprotective in preclinical studies [2]. Moderate oral bioavailability — glycoside forms (from food) are better absorbed than free kaempferol. Water-soluble glycosides extract in tea; aglycone extracts better in alcohol. Heat-stable: survives boiling and cooking. Drying preserves kaempferol. Gut bacteria cleave glycoside bonds, releasing free kaempferol for absorption in the colon. Synergistic with quercetin for anti-inflammatory effects.",

  "Quercetin":
    "Flavonol found widely in onions, elderflower, stinging nettle, hawthorn, and many fruits and vegetables. Potent antioxidant and anti-inflammatory: inhibits COX-2, LOX, and NF-κB. Mast cell stabilizer — inhibits histamine release (anti-allergic) [1]. Also inhibits xanthine oxidase (anti-gout mechanism) [2]. Poorly bioavailable in aglycone form; glycoside forms (rutin, quercitrin) from food are better absorbed. Water-soluble glycosides extract in tea; aglycone extracts better in alcohol. Heat-stable: survives cooking. Drying preserves quercetin well. Gut bacteria deglycosylate quercetin glycosides for absorption. Onion skins contain 10× more quercetin than flesh.",

  "Apigenin":
    "Flavone found in chamomile, parsley, celery, and many Asteraceae. Binds GABA-A benzodiazepine receptors as a partial agonist [1] — anxiolytic without strong sedation or dependence risk. Also anti-inflammatory (inhibits COX-2, iNOS) [2] and anti-proliferative. Water-soluble glycoside (apigenin-7-glucoside) extracts well in chamomile tea. Alcohol tincture extracts both glycoside and aglycone forms. Heat-stable. Drying preserves apigenin. Relatively poor oral bioavailability (~30%) due to first-pass metabolism, but chamomile tea provides clinically relevant amounts. Not significantly affected by fermentation.",

  "Ricin":
    "Extremely toxic lectin (ribosome-inactivating protein) found in castor bean seeds. One of the most potent plant toxins — lethal dose ~1 μg/kg. Inhibits protein synthesis by depurinating ribosomal RNA. NOT present in castor oil — the oil extraction process denatures and removes ricin. Heating above 80°C for 10 minutes denatures ricin. Not volatile — no inhalation risk from seeds. Water extraction would dissolve ricin — castor bean tea would be toxic. Castor oil is safe because ricin is water-soluble but not oil-soluble, and the pressing and heating process eliminates any trace contamination.",

  "Podophyllotoxin":
    "Lignan found in mayapple (Podophyllum peltatum) rhizome. Potent antimitotic: inhibits tubulin polymerization, arresting cell division in metaphase. Too toxic for internal use in crude form. Semi-synthetic derivatives etoposide and teniposide are important chemotherapy drugs. Topical podophyllin resin (25% podophyllotoxin) used for genital warts. Alcohol tincture extracts podophyllotoxin efficiently. Water extraction is less effective (poorly water-soluble). Drying preserves podophyllotoxin. Heat-stable under normal conditions. Extremely toxic if ingested — causes severe GI damage, bone marrow suppression, and multiorgan failure.",

  "Aconitine":
    "Diterpenoid alkaloid from aconite (Aconitum species). Extremely toxic — lethal dose ~2–5 mg. Activates voltage-gated sodium channels, causing persistent depolarization of cardiac and neural tissue. Traditional Chinese and Ayurvedic processing (prolonged boiling/steaming) reduces aconitine to less toxic aconine and benzoylaconine derivatives — processed aconite (fu zi / zhi fu zi) has 1/200th the toxicity of raw. Alcohol tincture of raw aconite is EXTREMELY dangerous. Drying does NOT reduce toxicity. Only used after extensive processing in traditional formulas by experienced practitioners. Homeopathic preparations are diluted beyond pharmacological activity.",

  "Thymoquinone":
    "Monoterpene phenol from Nigella sativa (black seed). Primary bioactive compound responsible for most of black seed's pharmacological effects. Potent antioxidant: scavenges superoxide and inhibits lipid peroxidation [2]. Anti-inflammatory via NF-κB and MAPK pathway inhibition [1]. Immunomodulatory: enhances NK cell activity and macrophage function. Also hepatoprotective and nephroprotective. Moderately heat-stable: survives gentle cooking but prolonged high heat degrades it. Cold-pressed black seed oil preserves thymoquinone well (typically 0.5–1.5%). Alcohol tincture extracts thymoquinone efficiently. Drying preserves it. Roasting seeds at high temperature reduces thymoquinone content significantly. Bioavailability improved by co-administration with lipids.",

  "Anthraquinones":
    "Aromatic compounds found in senna, aloe, rhubarb, and He Shou Wu (Polygonum multiflorum). Stimulant laxatives: emodin and chrysophanol activate chloride channels in colonocytes [1], increasing water secretion and peristalsis via myenteric plexus stimulation. In He Shou Wu, processing (steaming with black bean liquid) converts free anthraquinones to bound glycoside forms — reducing laxative effect while retaining tonic properties. Raw form is strongly laxative; processed form is blood-nourishing. Water-soluble: extract well in decoction. Alcohol tincture also effective. Drying preserves anthraquinones. Chronic use of stimulant anthraquinones can cause melanosis coli and electrolyte imbalance. Emodin has additional anti-inflammatory and hepatoprotective effects at low doses [2].",

  "Tartaric acid":
    "Alpha-hydroxy dicarboxylic acid, the dominant organic acid in tamarind fruit (up to 16% by weight). Responsible for tamarind's intensely sour taste. Antimicrobial: inhibits bacterial growth by acidifying the environment. Mild laxative via osmotic water retention in the intestinal lumen. Acts as a natural chelator of iron and calcium — can enhance or inhibit mineral absorption depending on context. Heat-stable: survives boiling and cooking completely. Water-soluble: extracts fully in decoction and juice. Drying preserves tartaric acid. Not significantly affected by fermentation. Also found in grapes (as potassium bitartrate/cream of tartar). Used commercially as an acidulant and antioxidant synergist in food preservation.",

  "Diosgenin":
    "Steroidal sapogenin found in wild yam (Dioscorea villosa) and fenugreek. The aglycone of dioscin. Structurally similar to cholesterol and steroid hormones. Historically used as the starting material for industrial synthesis of progesterone, cortisone, and other steroid drugs (Russell Marker, 1943). The human body CANNOT convert diosgenin to progesterone — it lacks the necessary enzymatic machinery, despite persistent marketing claims. Anti-inflammatory: inhibits NF-κB and COX-2 in vitro [1]. Also antispasmodic on smooth muscle [2]. Extracted by prolonged boiling/decoction (saponins require heat to release). Alcohol tincture extracts diosgenin moderately. Drying preserves diosgenin well. Acid hydrolysis of dioscin yields diosgenin.",

  "Isothiocyanates":
    "Sulfur-containing compounds formed from glucosinolate precursors by myrosinase enzyme when plant tissue is crushed or chewed. Found in moringa (moringa isothiocyanate/MIC), cruciferous vegetables (sulforaphane from broccoli). Potent activators of Nrf2 pathway — upregulate phase II detoxification enzymes (glutathione S-transferase, NQO1) [1]. Anti-inflammatory: inhibit NF-κB activation [2]. Moringa isothiocyanate is notably stable compared to sulforaphane. Cooking destroys myrosinase, reducing isothiocyanate formation from intact glucosinolates — light steaming preserves some activity. Drying moringa leaves preserves glucosinolate precursors; reconstituting with water can reactivate conversion. Fermentation may produce isothiocyanates if myrosinase-producing bacteria are present.",

  "Protodioscin":
    "Steroidal furostanol saponin found in Tribulus terrestris fruit and fenugreek. The primary bioactive saponin in Tribulus. Converted in the body to dehydroepiandrosterone (DHEA) — though the clinical significance of this conversion is debated. Enhances nitric oxide synthase (eNOS) activity, improving vasodilation [1]. Also increases androgen receptor density in some tissues. Anti-urolithic: reduces calcium oxalate crystal formation and aggregation (basis of kidney stone prevention use) [2]. Water-soluble glycoside: extracts in decoction. Alcohol tincture also effective. Drying preserves protodioscin. Heat-stable under normal cooking temperatures. Standardized Tribulus extracts are typically standardized to 40–60% saponins (primarily protodioscin).",

  "Arjunolic acid":
    "Oleanane-type triterpenoid found in Terminalia arjuna bark. Primary cardioactive compound. Cardioprotective: acts as a mild inotrope (strengthens heart contraction force) without increasing heart rate [1], via modulation of intracellular calcium handling. Also antioxidant — protects myocardial tissue from ischemia-reperfusion oxidative damage [2]. Hypolipidemic: reduces LDL oxidation and total cholesterol. Mild ACE-inhibiting activity contributes to blood pressure reduction. Water-soluble: extracts well in decoction (traditional method). Alcohol tincture also effective. Traditional Ayurvedic Kshirapaka preparation (decoction in milk) enhances absorption of both arjunolic acid and accompanying triterpenoids. Drying preserves arjunolic acid well. Heat-stable.",
};

// ── Substance references ────────────────────────────────────────────────────

const SUBSTANCE_REFS: Record<string, Reference[]> = {
  "Gingerol": [
    { id: 1, authors: "Abdel-Aziz H et al.", title: "Mode of action of gingerols and shogaols on 5-HT3 receptors", journal: "Eur J Pharmacol", year: 2006, url: "https://pubmed.ncbi.nlm.nih.gov/16364290/" },
    { id: 2, authors: "van Breemen RB et al.", title: "Cyclooxygenase-2 inhibitors in ginger (Zingiber officinale)", journal: "Fitoterapia", year: 2011, url: "https://doi.org/10.1016/j.fitote.2010.09.004" },
    { id: 3, authors: "Bhattarai S et al.", title: "The stability of gingerol and shogaol in aqueous solutions", journal: "J Pharm Sci", year: 2001, url: "https://pubmed.ncbi.nlm.nih.gov/11745724/" },
  ],
  "Allicin": [
    { id: 1, authors: "Müller A et al.", title: "Allicin induces thiol stress in bacteria through S-allylmercapto modification of protein cysteines", journal: "J Biol Chem", year: 2016, url: "https://doi.org/10.1074/jbc.M115.702308" },
    { id: 2, authors: "Borlinghaus J et al.", title: "Allicin: chemistry and biological properties", journal: "Molecules", year: 2014, url: "https://doi.org/10.3390/molecules190812591" },
    { id: 3, authors: "Fujisawa H et al.", title: "Biological and chemical stability of garlic-derived allicin", journal: "J Agric Food Chem", year: 2008, url: "https://doi.org/10.1021/jf8000907" },
  ],
  "Eugenol": [
    { id: 1, authors: "Kim SS et al.", title: "Eugenol suppresses cyclooxygenase-2 expression in lipopolysaccharide-stimulated mouse macrophage RAW264.7 cells", journal: "Life Sciences", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/12757841/" },
    { id: 2, authors: "Park CK et al.", title: "Molecular mechanism for local anesthetic action of eugenol in the rat trigeminal system", journal: "Pain", year: 2009, url: "https://pubmed.ncbi.nlm.nih.gov/19376653/" },
    { id: 3, authors: "Marchese A et al.", title: "Antimicrobial activity of eugenol and essential oils containing eugenol: a mechanistic viewpoint", journal: "Crit Rev Microbiol", year: 2017, url: "https://doi.org/10.1080/1040841X.2017.1295225" },
  ],
  "Curcumin": [
    { id: 1, authors: "Singh S, Aggarwal BB", title: "Activation of transcription factor NF-kappa B is suppressed by curcumin", journal: "J Biol Chem", year: 1995, url: "https://pubmed.ncbi.nlm.nih.gov/7559628/" },
    { id: 2, authors: "Shoba G et al.", title: "Influence of piperine on the pharmacokinetics of curcumin in animals and human volunteers", journal: "Planta Medica", year: 1998, url: "https://pubmed.ncbi.nlm.nih.gov/9619120/" },
    { id: 3, authors: "Anand P et al.", title: "Bioavailability of curcumin: problems and promises", journal: "Mol Pharm", year: 2007, url: "https://doi.org/10.1021/mp700113r" },
  ],
  "Menthol": [
    { id: 1, authors: "McKemy DD et al.", title: "Identification of a cold receptor reveals a general role for TRP channels in thermosensation", journal: "Nature", year: 2002, url: "https://doi.org/10.1038/nature719" },
    { id: 2, authors: "Hawthorn M et al.", title: "The actions of peppermint oil and menthol on calcium channel dependent processes in intestinal, neuronal and cardiac preparations", journal: "Aliment Pharmacol Ther", year: 1988, url: "https://pubmed.ncbi.nlm.nih.gov/2856502/" },
  ],
  "Salicin": [
    { id: 1, authors: "Schmid B et al.", title: "Pharmacokinetics of salicin after oral administration of a standardised willow bark extract", journal: "Eur J Clin Pharmacol", year: 2001, url: "https://doi.org/10.1007/s002280100325" },
    { id: 2, authors: "Khayyal MT et al.", title: "Mechanisms involved in the anti-inflammatory effect of a standardized willow bark extract", journal: "Arzneimittelforschung", year: 2005, url: "https://pubmed.ncbi.nlm.nih.gov/16366042/" },
  ],
  "Berberine": [
    { id: 1, authors: "Lee YS et al.", title: "Berberine, a natural plant product, activates AMP-activated protein kinase with beneficial metabolic effects in diabetic and insulin-resistant states", journal: "Diabetes", year: 2006, url: "https://doi.org/10.2337/db06-0006" },
    { id: 2, authors: "Turner N et al.", title: "Berberine and its more biologically available derivative, dihydroberberine, inhibit mitochondrial respiratory complex I", journal: "Diabetes", year: 2008, url: "https://pubmed.ncbi.nlm.nih.gov/18285556/" },
    { id: 3, authors: "Pan GY et al.", title: "The involvement of P-glycoprotein in berberine absorption", journal: "Pharmacol Toxicol", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/12530470/" },
  ],
  "Thymol": [
    { id: 1, authors: "Xu J et al.", title: "The antibacterial mechanism of carvacrol and thymol against Escherichia coli", journal: "Lett Appl Microbiol", year: 2008, url: "https://pubmed.ncbi.nlm.nih.gov/19552781/" },
    { id: 2, authors: "Nostro A et al.", title: "Effects of oregano, carvacrol and thymol on Staphylococcus aureus and Staphylococcus epidermidis biofilms", journal: "J Med Microbiol", year: 2007, url: "https://doi.org/10.1099/jmm.0.46804-0" },
    { id: 3, authors: "Begrow F et al.", title: "Impact of thymol in thyme extracts on their antispasmodic action and ciliary clearance", journal: "Planta Medica", year: 2010, url: "https://pubmed.ncbi.nlm.nih.gov/19809973/" },
  ],
  "Rosmarinic acid": [
    { id: 1, authors: "Awad R et al.", title: "Bioassay-guided fractionation of lemon balm using an in vitro measure of GABA transaminase activity", journal: "Phytother Res", year: 2009, url: "https://pubmed.ncbi.nlm.nih.gov/19165747/" },
    { id: 2, authors: "Sahu A et al.", title: "Inhibition of complement by covalent attachment of rosmarinic acid to activated C3b", journal: "Biochem Pharmacol", year: 1999, url: "https://pubmed.ncbi.nlm.nih.gov/10353266/" },
  ],
  "Silymarin": [
    { id: 1, authors: "Sonnenbichler J, Zetl I", title: "Mechanism of action of silibinin. V. Effect on the synthesis of ribosomal RNA, mRNA and tRNA in rat liver in vivo", journal: "Hoppe-Seyler's Z Physiol Chem", year: 1984, url: "https://pubmed.ncbi.nlm.nih.gov/6469218/" },
    { id: 2, authors: "Fraschini F et al.", title: "Pharmacology of silymarin", journal: "Clin Drug Investig", year: 2002, url: "https://doi.org/10.2165/00044011-200222010-00007" },
    { id: 3, authors: "Basiglio CL et al.", title: "Differential effects of silymarin and its active component silibinin on plasma membrane stability and hepatocellular lysis", journal: "Chem Biol Interact", year: 2009, url: "https://pubmed.ncbi.nlm.nih.gov/19135039/" },
  ],
  "Withanolides": [
    { id: 1, authors: "Chandrasekhar K et al.", title: "A prospective, randomized double-blind, placebo-controlled study of safety and efficacy of ashwagandha root in reducing stress and anxiety in adults", journal: "Indian J Psychol Med", year: 2012, url: "https://pubmed.ncbi.nlm.nih.gov/23439798/" },
    { id: 2, authors: "Ichikawa H et al.", title: "Withanolides potentiate apoptosis, inhibit invasion, and abolish osteoclastogenesis through suppression of NF-kappaB activation", journal: "Mol Cancer Ther", year: 2006, url: "https://pubmed.ncbi.nlm.nih.gov/16818501/" },
    { id: 3, authors: "Candelario M et al.", title: "Direct evidence for GABAergic activity of Withania somnifera on mammalian ionotropic GABAA and GABA-rho receptors", journal: "J Ethnopharmacol", year: 2015, url: "https://pubmed.ncbi.nlm.nih.gov/26068424/" },
  ],
  "Boswellic acids": [
    { id: 1, authors: "Sailer ER et al.", title: "Acetyl-11-keto-beta-boswellic acid (AKBA): structure requirements for binding and 5-lipoxygenase inhibitory activity", journal: "Br J Pharmacol", year: 1996, url: "https://pubmed.ncbi.nlm.nih.gov/8646405/" },
    { id: 2, authors: "Safayhi H et al.", title: "Boswellic acids: novel, specific, nonredox inhibitors of 5-lipoxygenase", journal: "J Pharmacol Exp Ther", year: 1992, url: "https://pubmed.ncbi.nlm.nih.gov/1602379/" },
    { id: 3, authors: "Syrovets T et al.", title: "Acetyl-boswellic acids inhibit lipopolysaccharide-mediated TNF-alpha induction in monocytes by direct interaction with IkappaB kinases", journal: "J Immunol", year: 2005, url: "https://pubmed.ncbi.nlm.nih.gov/15611276/" },
  ],
  "Glycyrrhizin": [
    { id: 1, authors: "Tanahashi T et al.", title: "Glycyrrhizic acid suppresses type 2 11 beta-hydroxysteroid dehydrogenase expression in vivo", journal: "J Steroid Biochem Mol Biol", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/11983491/" },
    { id: 2, authors: "Armanini D et al.", title: "Pseudohyperaldosteronism: pathogenetic mechanisms", journal: "Crit Rev Clin Lab Sci", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/12892318/" },
    { id: 3, authors: "Pompei R et al.", title: "Glycyrrhizic acid inhibits virus growth and inactivates virus particles", journal: "Nature", year: 1979, url: "https://pubmed.ncbi.nlm.nih.gov/233133/" },
  ],
  "Piperine": [
    { id: 1, authors: "Bhardwaj RK et al.", title: "Piperine, a major constituent of black pepper, inhibits human P-glycoprotein and CYP3A4", journal: "J Pharmacol Exp Ther", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/12130727/" },
    { id: 2, authors: "Shoba G et al.", title: "Influence of piperine on the pharmacokinetics of curcumin in animals and human volunteers", journal: "Planta Medica", year: 1998, url: "https://pubmed.ncbi.nlm.nih.gov/9619120/" },
  ],
  "Capsaicin": [
    { id: 1, authors: "Caterina MJ et al.", title: "The capsaicin receptor: a heat-activated ion channel in the pain pathway", journal: "Nature", year: 1997, url: "https://pubmed.ncbi.nlm.nih.gov/9349813/" },
    { id: 2, authors: "Yaksh TL et al.", title: "Intrathecal capsaicin depletes substance P in the rat spinal cord and produces prolonged thermal analgesia", journal: "Science", year: 1979, url: "https://pubmed.ncbi.nlm.nih.gov/228392/" },
    { id: 3, authors: "Anand P, Bley K", title: "Topical capsaicin for pain management: therapeutic potential and mechanisms of action of the new high-concentration capsaicin 8% patch", journal: "Br J Anaesth", year: 2011, url: "https://pubmed.ncbi.nlm.nih.gov/21852280/" },
  ],
  "Valerenic acid": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
    { id: 2, authors: "Riedel E et al.", title: "Inhibition of gamma-aminobutyric acid catabolism by valerenic acid derivatives", journal: "Planta Medica", year: 1982, url: "https://pubmed.ncbi.nlm.nih.gov/7163416/" },
  ],
  "Catechins": [
    { id: 1, authors: "Fassina G et al.", title: "Mechanisms of inhibition of tumor angiogenesis and vascular tumor growth by epigallocatechin-3-gallate", journal: "Clin Cancer Res", year: 2004, url: "https://pubmed.ncbi.nlm.nih.gov/15269163/" },
    { id: 2, authors: "Dulloo AG et al.", title: "Efficacy of a green tea extract rich in catechin polyphenols and caffeine in increasing 24-h energy expenditure and fat oxidation in humans", journal: "Am J Clin Nutr", year: 1999, url: "https://pubmed.ncbi.nlm.nih.gov/10584049/" },
  ],
  "Anthocyanins": [
    { id: 1, authors: "Jeong JW et al.", title: "Anthocyanins downregulate lipopolysaccharide-induced inflammatory responses in BV2 microglial cells by suppressing the NF-κB and Akt/MAPKs signaling pathways", journal: "Int J Mol Sci", year: 2013, url: "https://doi.org/10.3390/ijms14011502" },
    { id: 2, authors: "Swaminathan K et al.", title: "Binding of a natural anthocyanin inhibitor to influenza neuraminidase by mass spectrometry", journal: "Anal Bioanal Chem", year: 2013, url: "https://doi.org/10.1007/s00216-013-7068-x" },
  ],
  "Proanthocyanidins": [
    { id: 1, authors: "Howell AB et al.", title: "A-type cranberry proanthocyanidins and uropathogenic bacterial anti-adhesion activity", journal: "Phytochemistry", year: 2005, url: "https://pubmed.ncbi.nlm.nih.gov/16055161/" },
    { id: 2, authors: "Foo LY et al.", title: "A-type proanthocyanidin trimers from cranberry that inhibit adherence of uropathogenic P-fimbriated Escherichia coli", journal: "J Nat Prod", year: 2000, url: "https://doi.org/10.1021/np000128u" },
    { id: 3, authors: "Aldini G et al.", title: "Procyanidins from grape seeds protect endothelial cells from peroxynitrite damage and enhance endothelium-dependent relaxation", journal: "Life Sciences", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/14511773/" },
  ],
  "Hypericin": [
    { id: 1, authors: "Miskovsky P", title: "Hypericin--a new antiviral and antitumor photosensitizer: mechanism of action and interaction with biological macromolecules", journal: "Curr Drug Targets", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/11899265/" },
    { id: 2, authors: "Hudson JB et al.", title: "Antiviral activities of hypericin", journal: "Antiviral Res", year: 1991, url: "https://pubmed.ncbi.nlm.nih.gov/1650164/" },
  ],
  "Hyperforin": [
    { id: 1, authors: "Leuner K et al.", title: "Hyperforin--a key constituent of St. John's wort specifically activates TRPC6 channels", journal: "FASEB J", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17666455/" },
    { id: 2, authors: "Schempp CM et al.", title: "Antibacterial activity of hyperforin from St John's wort, against multiresistant Staphylococcus aureus and gram-positive bacteria", journal: "The Lancet", year: 1999, url: "https://pubmed.ncbi.nlm.nih.gov/10382704/" },
    { id: 3, authors: "Moore LB et al.", title: "St. John's wort induces hepatic drug metabolism through activation of the pregnane X receptor", journal: "Proc Natl Acad Sci USA", year: 2000, url: "https://doi.org/10.1073/pnas.130155097" },
  ],
  "Ginkgolides": [
    { id: 1, authors: "Chung KF et al.", title: "Effect of a ginkgolide mixture (BN 52063) in antagonising skin and platelet responses to platelet activating factor in man", journal: "The Lancet", year: 1987, url: "https://pubmed.ncbi.nlm.nih.gov/2880069/" },
    { id: 2, authors: "Xia SH et al.", title: "Pharmacological action and mechanisms of ginkgolide B", journal: "Chin Med J", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17543184/" },
  ],
  "Apigenin": [
    { id: 1, authors: "Viola H et al.", title: "Apigenin, a component of Matricaria recutita flowers, is a central benzodiazepine receptors-ligand with anxiolytic effects", journal: "Planta Medica", year: 1995, url: "https://pubmed.ncbi.nlm.nih.gov/7617761/" },
    { id: 2, authors: "Liang YC et al.", title: "Suppression of inducible cyclooxygenase and inducible nitric oxide synthase by apigenin and related flavonoids in mouse macrophages", journal: "Carcinogenesis", year: 1999, url: "https://doi.org/10.1093/carcin/20.10.1945" },
  ],
  "Quercetin": [
    { id: 1, authors: "Weng Z et al.", title: "Quercetin is more effective than cromolyn in blocking human mast cell cytokine release and inhibits contact dermatitis and photosensitivity in humans", journal: "PLoS ONE", year: 2012, url: "https://doi.org/10.1371/journal.pone.0033805" },
    { id: 2, authors: "Cao H et al.", title: "X-ray crystal structure of a xanthine oxidase complex with the flavonoid inhibitor quercetin", journal: "J Nat Prod", year: 2014, url: "https://doi.org/10.1021/np500320g" },
  ],
  "Resveratrol": [
    { id: 1, authors: "Howitz KT et al.", title: "Small molecule activators of sirtuins extend Saccharomyces cerevisiae lifespan", journal: "Nature", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/12939617/" },
    { id: 2, authors: "Walle T", title: "Bioavailability of resveratrol", journal: "Ann N Y Acad Sci", year: 2011, url: "https://doi.org/10.1111/j.1749-6632.2010.05842.x" },
  ],
  "Oleuropein": [
    { id: 1, authors: "Scheffler A et al.", title: "Olea europaea leaf extract exerts L-type Ca2+ channel antagonistic effects", journal: "J Ethnopharmacol", year: 2008, url: "https://pubmed.ncbi.nlm.nih.gov/18790040/" },
    { id: 2, authors: "de Bock M et al.", title: "Human absorption and metabolism of oleuropein and hydroxytyrosol ingested as olive leaf extract", journal: "Mol Nutr Food Res", year: 2013, url: "https://pubmed.ncbi.nlm.nih.gov/23766098/" },
  ],
  "Cinnamaldehyde": [
    { id: 1, authors: "Gannon NP et al.", title: "trans-Cinnamaldehyde stimulates mitochondrial biogenesis through PGC-1α and PPARβ/δ leading to enhanced GLUT4 expression", journal: "Biochimie", year: 2015, url: "https://pubmed.ncbi.nlm.nih.gov/26449747/" },
    { id: 2, authors: "Niu C et al.", title: "Subinhibitory concentrations of cinnamaldehyde interfere with quorum sensing", journal: "Lett Appl Microbiol", year: 2006, url: "https://doi.org/10.1111/j.1472-765X.2006.02001.x" },
  ],
  "Ephedrine": [
    { id: 1, authors: "Kobayashi S et al.", title: "The sympathomimetic actions of l-ephedrine and d-pseudoephedrine: direct receptor activation or norepinephrine release?", journal: "Anesth Analg", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/14570629/" },
    { id: 2, authors: "Liles JT et al.", title: "Pressor responses to ephedrine are mediated by a direct mechanism in the rat", journal: "J Pharmacol Exp Ther", year: 2006, url: "https://pubmed.ncbi.nlm.nih.gov/16002460/" },
  ],
  "Cineole": [
    { id: 1, authors: "Juergens UR et al.", title: "Inhibition of cytokine production and arachidonic acid metabolism by eucalyptol (1.8-cineole) in human blood monocytes in vitro", journal: "Eur J Med Res", year: 1998, url: "https://pubmed.ncbi.nlm.nih.gov/9810029/" },
    { id: 2, authors: "Juergens UR et al.", title: "Inhibitory activity of 1,8-cineol (eucalyptol) on cytokine production in cultured human lymphocytes and monocytes", journal: "Pulm Pharmacol Ther", year: 2004, url: "https://pubmed.ncbi.nlm.nih.gov/15477123/" },
  ],
  "Linalool": [
    { id: 1, authors: "Silva Brum LF et al.", title: "Effects of linalool on [3H]MK801 and [3H] muscimol binding in mouse cortical membranes", journal: "Phytother Res", year: 2001, url: "https://pubmed.ncbi.nlm.nih.gov/11507735/" },
    { id: 2, authors: "Huo M et al.", title: "Anti-inflammatory effects of linalool in RAW 264.7 macrophages and lipopolysaccharide-induced lung injury model", journal: "J Surg Res", year: 2013, url: "https://pubmed.ncbi.nlm.nih.gov/23228323/" },
  ],
  "Baicalin": [
    { id: 1, authors: "van Leyen K et al.", title: "Baicalein and 12/15-lipoxygenase in the ischemic brain", journal: "Stroke", year: 2006, url: "https://pubmed.ncbi.nlm.nih.gov/17053180/" },
    { id: 2, authors: "Wang F et al.", title: "GABA A receptor subtype selectivity underlying selective anxiolytic effect of baicalin", journal: "Neuropharmacology", year: 2008, url: "https://pubmed.ncbi.nlm.nih.gov/18723037/" },
    { id: 3, authors: "Lai MY et al.", title: "Comparison of metabolic pharmacokinetics of baicalin and baicalein in rats", journal: "J Pharm Pharmacol", year: 2003, url: "https://pubmed.ncbi.nlm.nih.gov/12631413/" },
  ],
  "Parthenolide": [
    { id: 1, authors: "Garcia-Pineres AJ et al.", title: "Cysteine 38 in p65/NF-kappaB plays a crucial role in DNA binding inhibition by sesquiterpene lactones", journal: "J Biol Chem", year: 2001, url: "https://pubmed.ncbi.nlm.nih.gov/11500489/" },
    { id: 2, authors: "Groenewegen WA et al.", title: "A comparison of the effects of an extract of feverfew and parthenolide on human platelet activity in-vitro", journal: "J Pharm Pharmacol", year: 1990, url: "https://pubmed.ncbi.nlm.nih.gov/1981582/" },
  ],
  "Beta-glucans": [
    { id: 1, authors: "Brown GD et al.", title: "Dectin-1 is a major beta-glucan receptor on macrophages", journal: "J Exp Med", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/12163569/" },
    { id: 2, authors: "Goodridge HS et al.", title: "Beta-glucan recognition by the innate immune system", journal: "Immunol Rev", year: 2009, url: "https://pubmed.ncbi.nlm.nih.gov/19594628/" },
  ],
  "Inulin": [
    { id: 1, authors: "Roberfroid MB et al.", title: "The bifidogenic nature of chicory inulin and its hydrolysis products", journal: "J Nutr", year: 1998, url: "https://pubmed.ncbi.nlm.nih.gov/9430596/" },
    { id: 2, authors: "Abrams SA et al.", title: "An inulin-type fructan enhances calcium absorption primarily via an effect on colonic absorption in humans", journal: "J Nutr", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17884999/" },
  ],
  "Kavalactones": [
    { id: 1, authors: "Chua HC et al.", title: "Kavain, the major constituent of the anxiolytic kava extract, potentiates GABAA receptors", journal: "PLoS ONE", year: 2016, url: "https://doi.org/10.1371/journal.pone.0157700" },
    { id: 2, authors: "Gleitz J et al.", title: "Anticonvulsive action of kavain estimated from its properties on stimulated synaptosomes and Na+ channel receptor sites", journal: "Eur J Pharmacol", year: 1996, url: "https://pubmed.ncbi.nlm.nih.gov/8960869/" },
    { id: 3, authors: "Prinsloo D et al.", title: "Monoamine oxidase inhibition by kavalactones from kava (Piper methysticum)", journal: "Planta Medica", year: 2019, url: "https://pubmed.ncbi.nlm.nih.gov/31539917/" },
  ],
  "Ellagic acid": [
    { id: 1, authors: "Narayanan BA et al.", title: "p53/p21(WAF1/CIP1) expression and its possible role in G1 arrest and apoptosis in ellagic acid treated cancer cells", journal: "Cancer Lett", year: 1999, url: "https://pubmed.ncbi.nlm.nih.gov/10355751/" },
    { id: 2, authors: "Espin JC et al.", title: "Biological significance of urolithins, the gut microbial ellagic acid-derived metabolites", journal: "Evid Based Complement Alternat Med", year: 2013, url: "https://doi.org/10.1155/2013/270418" },
  ],
  "Harpagosides": [
    { id: 1, authors: "Huang TH et al.", title: "Harpagoside suppresses lipopolysaccharide-induced iNOS and COX-2 expression through inhibition of NF-kappa B activation", journal: "J Ethnopharmacol", year: 2006, url: "https://pubmed.ncbi.nlm.nih.gov/16203115/" },
    { id: 2, authors: "Fiebich BL et al.", title: "Molecular targets of the antiinflammatory Harpagophytum procumbens (devil's claw): inhibition of TNF-alpha and COX-2 gene expression", journal: "Phytother Res", year: 2012, url: "https://pubmed.ncbi.nlm.nih.gov/22072539/" },
  ],
  "Anethole": [
    { id: 1, authors: "Soares PM et al.", title: "Effects of anethole and structural analogues on the contractility of rat isolated aorta: involvement of voltage-dependent Ca2+-channels", journal: "Life Sciences", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17869309/" },
    { id: 2, authors: "Albert-Puleo M", title: "Fennel and anise as estrogenic agents", journal: "J Ethnopharmacol", year: 1980, url: "https://pubmed.ncbi.nlm.nih.gov/6999244/" },
  ],
  "Bisabolol": [
    { id: 1, authors: "Kim S et al.", title: "Inhibitory effects of (-)-alpha-bisabolol on LPS-induced inflammatory response in RAW264.7 macrophages", journal: "Food Chem Toxicol", year: 2011, url: "https://pubmed.ncbi.nlm.nih.gov/21771629/" },
    { id: 2, authors: "Villegas LF et al.", title: "(+)-epi-Alpha-bisabolol is the wound-healing principle of Peperomia galioides", journal: "J Nat Prod", year: 2001, url: "https://pubmed.ncbi.nlm.nih.gov/11678668/" },
  ],
  "Thymoquinone": [
    { id: 1, authors: "Sethi G et al.", title: "Targeting nuclear factor-kappa B activation pathway by thymoquinone: role in suppression of antiapoptotic gene products", journal: "Mol Cancer Res", year: 2008, url: "https://pubmed.ncbi.nlm.nih.gov/18567808/" },
    { id: 2, authors: "Nagi MN et al.", title: "Thymoquinone protects against carbon tetrachloride hepatotoxicity in mice via an antioxidant mechanism", journal: "Biochem Mol Biol Int", year: 1999, url: "https://pubmed.ncbi.nlm.nih.gov/10092955/" },
  ],
  "Arjunolic acid": [
    { id: 1, authors: "Oberoi L et al.", title: "The aqueous extract of Terminalia arjuna bark exerts cardiotonic effect on adult ventricular myocytes", journal: "Phytomedicine", year: 2011, url: "https://pubmed.ncbi.nlm.nih.gov/21315570/" },
    { id: 2, authors: "Sumitra M et al.", title: "Experimental myocardial necrosis in rats: role of arjunolic acid on platelet aggregation, coagulation and antioxidant status", journal: "Mol Cell Biochem", year: 2001, url: "https://pubmed.ncbi.nlm.nih.gov/11693190/" },
  ],
  "Diosgenin": [
    { id: 1, authors: "Shishodia S, Aggarwal BB", title: "Diosgenin inhibits osteoclastogenesis, invasion, and proliferation through the downregulation of Akt, IkB kinase activation and NF-kB-regulated gene expression", journal: "Oncogene", year: 2006, url: "https://doi.org/10.1038/sj.onc.1209194" },
    { id: 2, authors: "Semwal P et al.", title: "Diosgenin: an updated pharmacological review and therapeutic perspectives", journal: "Oxid Med Cell Longev", year: 2022, url: "https://pubmed.ncbi.nlm.nih.gov/35677108/" },
  ],
  "Allantoin": [
    { id: 1, authors: "Araújo LU et al.", title: "Profile of wound healing process induced by allantoin", journal: "Acta Cir Bras", year: 2010, url: "https://pubmed.ncbi.nlm.nih.gov/20877959/" },
  ],
  "Aucubin": [
    { id: 1, authors: "Zeng X et al.", title: "A review of the pharmacology and toxicology of aucubin", journal: "Fitoterapia", year: 2020, url: "https://doi.org/10.1016/j.fitote.2019.104443" },
    { id: 2, authors: "Wang H et al.", title: "Aucubin alleviates oxidative stress and inflammation via Nrf2-mediated signaling activity in experimental traumatic brain injury", journal: "J Neuroinflammation", year: 2020, url: "https://doi.org/10.1186/s12974-020-01863-9" },
  ],
  "Arbutin": [
    { id: 1, authors: "Siegers C et al.", title: "Bacterial deconjugation of arbutin by Escherichia coli", journal: "Phytomedicine", year: 2003, url: "https://doi.org/10.1078/1433-187x-00301" },
    { id: 2, authors: "Schindler G et al.", title: "Urinary excretion and metabolism of arbutin after oral administration of Arctostaphylos uvae ursi extract", journal: "J Clin Pharmacol", year: 2002, url: "https://doi.org/10.1177/009127002401102740" },
  ],
  "Bilobalide": [
    { id: 1, authors: "Schwarzkopf TM et al.", title: "Neuroprotection by bilobalide in ischemia: improvement of mitochondrial function", journal: "Die Pharmazie", year: 2013, url: "https://pubmed.ncbi.nlm.nih.gov/23923641/" },
    { id: 2, authors: "Mdzinarishvili A et al.", title: "Bilobalide prevents ischemia-induced edema formation in vitro and in vivo", journal: "Neuroscience", year: 2007, url: "https://doi.org/10.1016/j.neuroscience.2006.08.037" },
  ],
  "Chamazulene": [
    { id: 1, authors: "Safayhi H et al.", title: "Chamazulene: an antioxidant-type inhibitor of leukotriene B4 formation", journal: "Planta Medica", year: 1994, url: "https://doi.org/10.1055/s-2006-959520" },
    { id: 2, authors: "Ramadan M et al.", title: "Chamazulene carboxylic acid and matricin: a natural profen and its natural prodrug", journal: "J Nat Prod", year: 2006, url: "https://doi.org/10.1021/np0601556" },
  ],
  "Petasin": [
    { id: 1, authors: "Thomet OA et al.", title: "Differential inhibition of inflammatory effector functions by petasin, isopetasin and neopetasin in human eosinophils", journal: "Clin Exp Allergy", year: 2001, url: "https://doi.org/10.1046/j.1365-2222.2001.01158.x" },
    { id: 2, authors: "Schapowal A et al.", title: "Randomised controlled trial of butterbur and cetirizine for treating seasonal allergic rhinitis", journal: "BMJ", year: 2002, url: "https://doi.org/10.1136/bmj.324.7330.144" },
  ],
  "Kaempferol": [
    { id: 1, authors: "García-Mediavilla V et al.", title: "The anti-inflammatory flavones quercetin and kaempferol cause inhibition of inducible nitric oxide synthase, cyclooxygenase-2 and reactive C-protein", journal: "Eur J Pharmacol", year: 2007, url: "https://doi.org/10.1016/j.ejphar.2006.11.014" },
    { id: 2, authors: "Silva Dos Santos J et al.", title: "The pharmacological action of kaempferol in central nervous system diseases: a review", journal: "Front Pharmacol", year: 2021, url: "https://doi.org/10.3389/fphar.2020.565700" },
  ],
  "Isothiocyanates": [
    { id: 1, authors: "Das BN et al.", title: "Mechanisms of Nrf2/Keap1-dependent phase II cytoprotective and detoxifying gene expression and potential cellular targets of chemopreventive isothiocyanates", journal: "Oxid Med Cell Longev", year: 2013, url: "https://doi.org/10.1155/2013/839409" },
    { id: 2, authors: "Prawan A et al.", title: "Anti-NF-kappaB and anti-inflammatory activities of synthetic isothiocyanates", journal: "Chem Biol Interact", year: 2009, url: "https://doi.org/10.1016/j.cbi.2008.12.014" },
  ],
  "Protodioscin": [
    { id: 1, authors: "Do J et al.", title: "Effects and mechanism of action of a Tribulus terrestris extract on penile erection", journal: "Korean J Urol", year: 2013, url: "https://doi.org/10.4111/kju.2013.54.3.183" },
    { id: 2, authors: "Kaushik J et al.", title: "Delving into the antiurolithiatic potential of Tribulus terrestris extract through in vivo efficacy and preclinical safety investigations in Wistar rats", journal: "Sci Rep", year: 2019, url: "https://doi.org/10.1038/s41598-019-52398-w" },
  ],
  "Anthraquinones": [
    { id: 1, authors: "Xu JD et al.", title: "Emodin induces chloride secretion in rat distal colon through activation of mast cells and enteric neurons", journal: "Br J Pharmacol", year: 2012, url: "https://doi.org/10.1111/j.1476-5381.2011.01573.x" },
    { id: 2, authors: "Xie L et al.", title: "Chrysophanol: a review of its pharmacology, toxicity and pharmacokinetics", journal: "J Pharm Pharmacol", year: 2019, url: "https://doi.org/10.1111/jphp.13143" },
  ],
};

// ── Synergy references ──────────────────────────────────────────────────────

const SYNERGY_REFS: Record<string, Reference[]> = {
  "Cumin + Coriander": [
    { id: 1, authors: "Platel K, Srinivasan K", title: "Digestive stimulant action of spices: a myth or reality?", journal: "Indian J Med Res", year: 2004, url: "https://pubmed.ncbi.nlm.nih.gov/15218978/" },
    { id: 2, authors: "Heghes SC et al.", title: "Antispasmodic Effect of Essential Oils and Their Constituents: A Review", journal: "Molecules", year: 2019, url: "https://doi.org/10.3390/molecules24091675" },
  ],
  "Ginger + Turmeric": [
    { id: 1, authors: "Kim SO et al.", title: "[6]-Gingerol inhibits COX-2 expression by blocking the activation of p38 MAP kinase and NF-kappaB", journal: "Oncogene", year: 2005, url: "https://doi.org/10.1038/sj.onc.1208446" },
    { id: 2, authors: "Huang MT et al.", title: "Inhibitory effects of curcumin on in vitro lipoxygenase and cyclooxygenase activities in mouse epidermis", journal: "Cancer Research", year: 1991, url: "https://pubmed.ncbi.nlm.nih.gov/1899046/" },
  ],
  "Turmeric + Black Pepper": [
    { id: 1, authors: "Shoba G et al.", title: "Influence of piperine on the pharmacokinetics of curcumin in animals and human volunteers", journal: "Planta Medica", year: 1998, url: "https://doi.org/10.1055/s-2006-957450" },
  ],
  "Ashwagandha + Holy Basil": [
    { id: 1, authors: "Lopresti AL et al.", title: "An investigation into the stress-relieving and pharmacological actions of an ashwagandha extract", journal: "Medicine", year: 2019, url: "https://doi.org/10.1097/MD.0000000000017186" },
    { id: 2, authors: "Prakash P, Gupta N", title: "Therapeutic uses of Ocimum sanctum Linn (Tulsi) with a note on eugenol and its pharmacological actions", journal: "Indian J Physiol Pharmacol", year: 2005, url: "https://pubmed.ncbi.nlm.nih.gov/16170979/" },
  ],
  "Elder Flower + Echinacea": [
    { id: 1, authors: "Swaminathan K et al.", title: "Binding of a natural anthocyanin inhibitor to influenza neuraminidase by mass spectrometry", journal: "Anal Bioanal Chem", year: 2013, url: "https://doi.org/10.1007/s00216-013-7068-x" },
    { id: 2, authors: "Raduner S et al.", title: "Alkylamides from Echinacea are a new class of cannabinomimetics: CB2 receptor-dependent and -independent immunomodulatory effects", journal: "J Biol Chem", year: 2006, url: "https://doi.org/10.1074/jbc.M601074200" },
  ],
  "Honey (Raw, Unprocessed) + Black Seed": [
    { id: 1, authors: "Majdalawieh AF, Fayyad MW", title: "Immunomodulatory and anti-inflammatory action of Nigella sativa and thymoquinone: A comprehensive review", journal: "Int Immunopharmacol", year: 2015, url: "https://pubmed.ncbi.nlm.nih.gov/26117430/" },
    { id: 2, authors: "Sanz ML et al.", title: "In vitro investigation into the potential prebiotic activity of honey oligosaccharides", journal: "J Agric Food Chem", year: 2005, url: "https://doi.org/10.1021/jf0500684" },
  ],
  "Turmeric + Amla": [
    { id: 1, authors: "Nimiya Y et al.", title: "Redox modulation of curcumin stability: Redox active antioxidants increase chemical stability of curcumin", journal: "Mol Nutr Food Res", year: 2016, url: "https://doi.org/10.1002/mnfr.201500681" },
    { id: 2, authors: "Edderkaoui M et al.", title: "Ellagic acid induces apoptosis through inhibition of nuclear factor kappa B in pancreatic cancer cells", journal: "World J Gastroenterol", year: 2008, url: "https://doi.org/10.3748/wjg.14.3672" },
  ],
  "Ashwagandha + Guduchi": [
    { id: 1, authors: "Nair PKR et al.", title: "Immune stimulating properties of a novel polysaccharide from the medicinal plant Tinospora cordifolia", journal: "Int Immunopharmacol", year: 2004, url: "https://doi.org/10.1016/j.intimp.2004.07.024" },
    { id: 2, authors: "Kapil A, Sharma S", title: "Immunopotentiating compounds from Tinospora cordifolia", journal: "J Ethnopharmacol", year: 1997, url: "https://doi.org/10.1016/S0378-8741(97)00086-X" },
  ],
  "Ashwagandha + Arjuna": [
    { id: 1, authors: "Sumitra M et al.", title: "Experimental myocardial necrosis in rats: role of arjunolic acid on platelet aggregation, coagulation and antioxidant status", journal: "Mol Cell Biochem", year: 2001, url: "https://doi.org/10.1023/A:1011927812753" },
    { id: 2, authors: "Hasan MM et al.", title: "Cardioprotective effects of arjunolic acid in LPS-stimulated H9C2 and C2C12 myotubes via the MyD88-dependent TLR4 signaling pathway", journal: "Pharmaceutical Biology", year: 2023, url: "https://doi.org/10.1080/13880209.2023.2230251" },
  ],
  "Turmeric + Boswellia": [
    { id: 1, authors: "Safayhi H et al.", title: "Boswellic acids: novel, specific, nonredox inhibitors of 5-lipoxygenase", journal: "J Pharmacol Exp Ther", year: 1992, url: "https://pubmed.ncbi.nlm.nih.gov/1602379/" },
    { id: 2, authors: "Singh S, Aggarwal BB", title: "Activation of transcription factor NF-kappa B is suppressed by curcumin", journal: "J Biol Chem", year: 1995, url: "https://pubmed.ncbi.nlm.nih.gov/7559628/" },
  ],
  "Valerian + Hops": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
  ],
  "Valerian + Passionflower": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
  ],
  "Valerian + Lemon Balm": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
    { id: 2, authors: "Awad R et al.", title: "Bioassay-guided fractionation of lemon balm using an in vitro measure of GABA transaminase activity", journal: "Phytother Res", year: 2009, url: "https://pubmed.ncbi.nlm.nih.gov/19165747/" },
  ],
  "Ginger + Cayenne": [
    { id: 1, authors: "van Breemen RB et al.", title: "Cyclooxygenase-2 inhibitors in ginger (Zingiber officinale)", journal: "Fitoterapia", year: 2011, url: "https://doi.org/10.1016/j.fitote.2010.09.004" },
    { id: 2, authors: "Caterina MJ et al.", title: "The capsaicin receptor: a heat-activated ion channel in the pain pathway", journal: "Nature", year: 1997, url: "https://pubmed.ncbi.nlm.nih.gov/9349813/" },
  ],
  "Stinging Nettle + Saw Palmetto": [
    { id: 1, authors: "Weng Z et al.", title: "Quercetin is more effective than cromolyn in blocking human mast cell cytokine release", journal: "PLoS ONE", year: 2012, url: "https://doi.org/10.1371/journal.pone.0033805" },
  ],
  "Cranberry + Goldenrod": [
    { id: 1, authors: "Howell AB et al.", title: "A-type cranberry proanthocyanidins and uropathogenic bacterial anti-adhesion activity", journal: "Phytochemistry", year: 2005, url: "https://pubmed.ncbi.nlm.nih.gov/16055161/" },
  ],
  "Ginkgo + Bacopa": [
    { id: 1, authors: "Chung KF et al.", title: "Effect of a ginkgolide mixture (BN 52063) in antagonising skin and platelet responses to platelet activating factor in man", journal: "The Lancet", year: 1987, url: "https://pubmed.ncbi.nlm.nih.gov/2880069/" },
  ],
  "Ashwagandha + Rhodiola": [
    { id: 1, authors: "Lopresti AL et al.", title: "An investigation into the stress-relieving and pharmacological actions of an ashwagandha extract", journal: "Medicine", year: 2019, url: "https://doi.org/10.1097/MD.0000000000017186" },
  ],
  "Cramp Bark + Valerian": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
  ],
};

// ── Caution descriptions & references ───────────────────────────────────────

const CAUTION_DESCRIPTIONS: Record<string, string> = {
  "Pregnancy": "Many herbs cross the placental barrier and may stimulate uterine contractions (emmenagogue/oxytocic effects) or disrupt fetal development. Alkaloids, volatile oils, and anthraquinone laxatives carry particular risk [1].",
  "Breastfeeding": "Lipophilic compounds (alkaloids, volatile oils, terpenoids) readily transfer into breast milk, potentially exposing the infant to pharmacologically active doses. Herbs that alter prolactin or dopamine may also affect milk supply.",
  "Blood thinners": "Many herbs inhibit platelet aggregation (via COX-1, thromboxane A2, or PAF pathways) or potentiate warfarin metabolism (CYP2C9/3A4 interactions), increasing bleeding risk when combined with anticoagulant drugs [1].",
  "Blood sugar": "Herbs containing berberine, cinnamaldehyde, or chromium-potentiating compounds can lower blood glucose via AMPK activation or enhanced insulin sensitivity [1], risking hypoglycemia when combined with diabetes medications.",
  "Blood pressure": "Herbs with ACE-inhibiting, calcium-channel-blocking, or vasodilatory activity may cause additive hypotension when combined with antihypertensive drugs, particularly in salt-depleted individuals.",
  "Liver conditions": "Hepatotoxic constituents including pyrrolizidine alkaloids, pulegone (pennyroyal), and kava lactones can cause veno-occlusive disease, centrilobular necrosis, or cholestatic injury in susceptible individuals [1].",
  "Kidney conditions": "Herbs containing oxalates (rhubarb, sorrel), aristolochic acid, or high-dose tannins can cause tubular damage, interstitial nephritis, or aggravate existing renal impairment by increasing filtration burden.",
  "Gallstones": "Cholagogue herbs (dandelion, artichoke, turmeric) stimulate bile flow via cholecystokinin release, which can mobilize gallstones and trigger biliary colic or obstruct the common bile duct.",
  "GERD / Acid reflux": "Peppermint and other carminatives relax the lower esophageal sphincter via calcium channel blockade and smooth muscle relaxation, worsening gastroesophageal reflux symptoms.",
  "Children": "Children have immature hepatic CYP450 enzyme systems and lower body mass, making them more susceptible to dose-dependent toxicity. Many herbs lack pediatric pharmacokinetic data.",
  "Drug interactions": "Herbs can alter drug metabolism via CYP450 induction (St. John's wort induces CYP3A4 [1]) or inhibition (piperine inhibits CYP3A4 and P-glycoprotein), causing subtherapeutic or toxic drug levels.",
  "Sedation": "GABAergic herbs (valerian, kava, passionflower) potentiate GABA-A receptor activity, producing additive sedation when combined with benzodiazepines, barbiturates, or alcohol [1].",
  "Allergic reactions": "Asteraceae (chamomile, echinacea, feverfew) contain sesquiterpene lactones that can trigger contact dermatitis and cross-reactive IgE-mediated responses in ragweed-sensitive individuals.",
  "Photosensitivity": "Furanocoumarins and naphthodianthrones (hypericin from St. John's wort) absorb UV radiation and generate reactive oxygen species in skin cells, causing phototoxic dermatitis [1].",
  "Surgery": "Herbs affecting coagulation (garlic, ginkgo, ginger inhibit platelet aggregation) or anesthesia metabolism (kava, valerian potentiate sedatives) should be discontinued 2–3 weeks before elective surgery.",
  "Topical use only": "Certain herbs contain compounds too toxic for systemic absorption (comfrey pyrrolizidine alkaloids, podophyllotoxin) but safe at controlled topical doses where hepatic first-pass metabolism is bypassed.",
  "Short-term use only": "Chronic use of stimulant laxatives (anthraquinones) causes electrolyte depletion and dependency [1]; prolonged sympathomimetic use (ephedra) risks cardiovascular damage; extended kava use may cause hepatotoxicity.",
  "Estrogenic effects": "Phytoestrogens (isoflavones, coumestans, lignans) and structurally estrogenic compounds (anethole) bind estrogen receptors, potentially stimulating hormone-sensitive tissue proliferation [1].",
  "Warming / Heat conditions": "In traditional energetic frameworks, warming herbs (ginger, cinnamon, cayenne) contain TRPV1 agonists and sympathomimetics that increase metabolic heat production, potentially aggravating inflammatory or febrile conditions.",
  "Cooling / Cold conditions": "Cooling herbs (peppermint, chamomile) activate TRPM8 receptors and have peripheral vasodilatory effects that may worsen cold-pattern presentations in traditional diagnostic frameworks.",
  "GI upset": "Many herbs cause dose-dependent gastrointestinal irritation via direct mucosal contact (capsaicin, volatile oils), osmotic effects (saponins), or stimulation of gastric acid secretion (bitters).",
  "Heart conditions": "Cardiac glycoside-containing plants (foxglove, lily of the valley) inhibit Na+/K+-ATPase; sympathomimetics (ephedra) increase cardiac workload; both carry arrhythmia risk in pre-existing cardiac disease.",
  "Autoimmune conditions": "Immunostimulant herbs (echinacea, astragalus) activate innate immunity via Dectin-1, TLR, and NF-κB pathways, potentially exacerbating autoimmune flares by amplifying self-reactive immune responses.",
  "Thyroid conditions": "Goitrogens (isothiocyanates from cruciferous plants) inhibit thyroid peroxidase, reducing iodine organification and T4 synthesis. Bugleweed directly suppresses TSH and peripheral T4-to-T3 conversion.",
  "Narrow therapeutic window": "Plants like aconite, belladonna, and digitalis contain alkaloids or glycosides where the therapeutic dose is close to the toxic dose, requiring precise dosing — small variations can cause toxicity or treatment failure.",
};

const CAUTION_REFS: Record<string, Reference[]> = {
  "Pregnancy": [
    { id: 1, authors: "Ernst E", title: "Herbal medicinal products during pregnancy: are they safe?", journal: "BJOG", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/11966439/" },
  ],
  "Blood thinners": [
    { id: 1, authors: "Heck AM et al.", title: "Potential interactions between alternative therapies and warfarin", journal: "Am J Health Syst Pharm", year: 2000, url: "https://pubmed.ncbi.nlm.nih.gov/10938982/" },
  ],
  "Blood sugar": [
    { id: 1, authors: "Lee YS et al.", title: "Berberine, a natural plant product, activates AMP-activated protein kinase with beneficial metabolic effects in diabetic and insulin-resistant states", journal: "Diabetes", year: 2006, url: "https://doi.org/10.2337/db06-0006" },
  ],
  "Liver conditions": [
    { id: 1, authors: "Teschke R et al.", title: "Herbal hepatotoxicity: a tabular compilation of reported cases", journal: "Liver Int", year: 2012, url: "https://pubmed.ncbi.nlm.nih.gov/22429502/" },
  ],
  "Drug interactions": [
    { id: 1, authors: "Moore LB et al.", title: "St. John's wort induces hepatic drug metabolism through activation of the pregnane X receptor", journal: "Proc Natl Acad Sci USA", year: 2000, url: "https://doi.org/10.1073/pnas.130155097" },
  ],
  "Sedation": [
    { id: 1, authors: "Khom S et al.", title: "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity", journal: "Neuropharmacology", year: 2007, url: "https://pubmed.ncbi.nlm.nih.gov/17585957/" },
  ],
  "Photosensitivity": [
    { id: 1, authors: "Miskovsky P", title: "Hypericin--a new antiviral and antitumor photosensitizer: mechanism of action and interaction with biological macromolecules", journal: "Curr Drug Targets", year: 2002, url: "https://pubmed.ncbi.nlm.nih.gov/11899265/" },
  ],
  "Short-term use only": [
    { id: 1, authors: "Xu JD et al.", title: "Emodin induces chloride secretion in rat distal colon through activation of mast cells and enteric neurons", journal: "Br J Pharmacol", year: 2012, url: "https://doi.org/10.1111/j.1476-5381.2011.01573.x" },
  ],
  "Estrogenic effects": [
    { id: 1, authors: "Albert-Puleo M", title: "Fennel and anise as estrogenic agents", journal: "J Ethnopharmacol", year: 1980, url: "https://pubmed.ncbi.nlm.nih.gov/6999244/" },
  ],
};

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
        refs: null,
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
      refs: null,
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
    this.parseCompoundReference();
    this.addSupplementaryPlants();
    this.applySubstanceDescriptions();
    this.applySynergyRefs();
    this.applyCautionDescriptions();
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
                      refs: null,
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

  // ── Parse Active Compounds Reference table ─────────────────────────────────

  private parseCompoundReference() {
    const startIdx = this.lines.findIndex((l) => l.includes("Active Compounds Reference"));
    if (startIdx === -1) {
      console.warn("  Warning: Active Compounds Reference not found");
      return;
    }

    const endIdx = this.lines.findIndex(
      (l, idx) => idx > startIdx && l.startsWith("=== ") && !l.includes("Active Compounds")
    );
    const end = endIdx === -1 ? this.lines.length : endIdx;

    let inTable = false;
    let isHeaderRow = false;
    let linked = 0;

    for (let i = startIdx; i < end; i++) {
      const line = this.lines[i].trim();

      if (line === "|===") {
        inTable = !inTable;
        isHeaderRow = inTable;
        continue;
      }

      if (inTable && line.startsWith("|") && !isHeaderRow) {
        const cells = line.split("|").filter(Boolean).map((c) => cleanAsciiDoc(c.trim()));
        if (cells.length >= 2) {
          const plantName = cells[0].trim();
          const compounds = cells[1].split(",").map((c) => c.trim()).filter(Boolean);

          const plant = this.findPlantByName(plantName);
          if (plant) {
            for (const compound of compounds) {
              // Match against SUBSTANCE_PATTERNS to use canonical name
              const match = SUBSTANCE_PATTERNS.find((sp) =>
                sp.patterns.some((p) => p.test(compound))
              );
              const subName = match ? match.name : compound;
              const sub = this.getOrCreateSubstance(subName);
              const key = `${plant.id}-${sub.id}`;
              if (!this.plantSubstances.has(key)) {
                this.plantSubstances.add(key);
                linked++;
              }
            }
          }
        }
      }

      if (isHeaderRow && line.startsWith("|")) {
        isHeaderRow = false;
      }
    }

    console.log(`  Compound ref links: ${linked}`);
  }

  // ── Apply substance descriptions ─────────────────────────────────────────

  private applySubstanceDescriptions() {
    let applied = 0;
    let refsApplied = 0;
    for (const sub of this.substances.values()) {
      const desc = SUBSTANCE_DESCRIPTIONS[sub.name];
      if (desc) {
        sub.description = desc;
        applied++;
      }
      const refs = SUBSTANCE_REFS[sub.name];
      if (refs) {
        sub.refs = refs;
        refsApplied++;
      }
    }
    console.log(`  Substance descs: ${applied}/${this.substances.size}`);
    console.log(`  Substance refs:  ${refsApplied}/${this.substances.size}`);
  }

  private applySynergyRefs() {
    let applied = 0;
    for (const syn of this.synergies) {
      const plantA = Array.from(this.plants.values()).find(p => p.id === syn.plant_a_id);
      const plantB = Array.from(this.plants.values()).find(p => p.id === syn.plant_b_id);
      if (plantA && plantB) {
        const key = `${plantA.name} + ${plantB.name}`;
        const keyReverse = `${plantB.name} + ${plantA.name}`;
        const refs = SYNERGY_REFS[key] || SYNERGY_REFS[keyReverse];
        if (refs) {
          syn.refs = refs;
          applied++;
        }
      }
    }
    console.log(`  Synergy refs:    ${applied}/${this.synergies.length}`);
  }

  private applyCautionDescriptions() {
    let applied = 0;
    let refsApplied = 0;
    for (const caution of this.cautions.values()) {
      const desc = CAUTION_DESCRIPTIONS[caution.name];
      if (desc) {
        caution.detail = desc;
        applied++;
      }
      const refs = CAUTION_REFS[caution.name];
      if (refs) {
        caution.refs = refs;
        refsApplied++;
      }
    }
    console.log(`  Caution descs:   ${applied}/${this.cautions.size}`);
    console.log(`  Caution refs:    ${refsApplied}/${this.cautions.size}`);
  }

  // ── Add supplementary plants not in the AsciiDoc ─────────────────────────

  private addSupplementaryPlants() {
    const linkCondition = (plant: Plant, nameFragment: string) => {
      const lower = nameFragment.toLowerCase();
      for (const cond of this.conditions.values()) {
        if (cond.name.toLowerCase().includes(lower)) {
          this.plantConditions.add(`${plant.id}-${cond.id}`);
          return;
        }
      }
    };

    const linkTradition = (plant: Plant, slug: string) => {
      const tradition = this.traditions.get(slug);
      if (tradition) this.plantTraditions.add(`${plant.id}-${tradition.id}`);
    };

    const linkPrep = (plant: Plant, slug: string) => {
      const prep = this.preparations.get(slug);
      if (prep) {
        const key = `${plant.id}-${prep.id}`;
        if (!this.plantPreparations.has(key)) this.plantPreparations.set(key, null);
      }
    };

    const linkSubstance = (plant: Plant, name: string) => {
      const sub = this.getOrCreateSubstance(name);
      this.plantSubstances.add(`${plant.id}-${sub.id}`);
    };

    const linkCaution = (plant: Plant, slug: string) => {
      const caution = this.cautions.get(slug);
      if (caution) {
        const key = `${plant.id}-${caution.id}`;
        if (!this.plantCautions.has(key)) this.plantCautions.set(key, null);
      }
    };

    const addSynergy = (plantA: Plant, plantB: Plant, effect: string, mechanism: string, tradition: string) => {
      const [lowId, highId] = plantA.id < plantB.id ? [plantA.id, plantB.id] : [plantB.id, plantA.id];
      const exists = this.synergies.some(s => s.plant_a_id === lowId && s.plant_b_id === highId);
      if (!exists) {
        this.synergies.push({ plant_a_id: lowId, plant_b_id: highId, mechanism, effect, tradition, refs: null });
      }
    };

    // Pre-lookup existing plants for synergies
    const honey = this.findPlantByName("Honey");
    const turmeric = this.findPlantByName("Turmeric");
    const ashwagandha = this.findPlantByName("Ashwagandha");

    // === 1. Black Seed ===
    const blackSeed = this.findOrCreatePlant("Black Seed", "Nigella sativa", "Seeds");
    blackSeed.alt_names = ["Habbatus Sauda (Arabic)", "Kalonji (Hindi/Urdu)", "Black Cumin", "Schwarzkümmel (German)"];
    blackSeed.description = "Seeds used for immune support, digestive health, respiratory conditions, and inflammation. Traditionally chewed, ground with honey, or pressed for oil. The Prophet Muhammad (peace be upon him) described it as 'a cure for every disease except death.'";
    blackSeed.historical = "One of the most historically significant medicinal seeds. Referenced in Hadith (Sahih Bukhari) as 'a cure for every disease except death.' Found in Tutankhamun's tomb (1323 BCE). Ibn Sina's Canon recommends it for respiratory conditions and lethargy. Extensively documented in Unani and Ayurvedic texts as Kalonji.";
    linkTradition(blackSeed, "prophetic-medicine");
    linkTradition(blackSeed, "ayurveda");
    linkTradition(blackSeed, "unani");
    linkCondition(blackSeed, "General Inflammation");
    linkCondition(blackSeed, "Cough");
    linkCondition(blackSeed, "Loss of Appetite");
    linkCondition(blackSeed, "Headache");
    linkPrep(blackSeed, "oil");
    linkPrep(blackSeed, "powder");
    linkPrep(blackSeed, "tea");
    linkPrep(blackSeed, "chewing");
    linkPrep(blackSeed, "paste");
    linkSubstance(blackSeed, "Thymoquinone");
    linkSubstance(blackSeed, "Volatile oils");
    linkSubstance(blackSeed, "Flavonoids");
    linkCaution(blackSeed, "pregnancy");
    linkCaution(blackSeed, "blood-sugar");
    linkCaution(blackSeed, "blood-thinners");
    if (honey) {
      addSynergy(blackSeed, honey, "Immune-boosting powerhouse; enhanced antimicrobial activity",
        "Thymoquinone (TQ) activates TLR-mediated innate immune pathways; honey oligosaccharides are prebiotic and provide hydrogen peroxide-based antimicrobial activity; TQ's antioxidant effect synergizes with honey's flavonoid antioxidants",
        "Prophetic Medicine");
    }

    // === 2. Amla ===
    const amla = this.findOrCreatePlant("Amla", "Phyllanthus emblica", "Fruit");
    amla.alt_names = ["Indian Gooseberry", "Amalaki (Sanskrit)", "Emblic Myrobalan", "Nelli (Tamil)"];
    amla.description = "One of the three fruits in Triphala. Exceptionally high in vitamin C and antioxidants. Used for digestive health, immune support, hair and skin health, and as a general rejuvenative (rasayana) in Ayurveda.";
    amla.historical = "Central to Ayurvedic medicine as one of the most important rasayanas (rejuvenatives). Key ingredient in Chyawanprash, the 2500-year-old tonic formula. The Charaka Samhita considers it the best among sour fruits and anti-aging herbs. Part of Triphala (three fruits) alongside haritaki and bibhitaki.";
    linkTradition(amla, "ayurveda");
    linkCondition(amla, "General Inflammation");
    linkCondition(amla, "Loss of Appetite");
    linkCondition(amla, "Sore Throat");
    linkPrep(amla, "powder");
    linkPrep(amla, "juice");
    linkPrep(amla, "tea");
    linkPrep(amla, "decoction");
    linkSubstance(amla, "Ellagic acid");
    linkSubstance(amla, "Quercetin");
    linkSubstance(amla, "Tannins");
    linkSubstance(amla, "Flavonoids");
    linkCaution(amla, "blood-sugar");
    linkCaution(amla, "gi-upset");
    if (turmeric) {
      addSynergy(amla, turmeric, "Enhanced anti-inflammatory; vitamin C improves curcumin stability",
        "Ascorbic acid (amla) protects curcumin from oxidative degradation in the GI tract; ellagic acid and curcumin both inhibit NF-κB via different binding sites; amla's tannins slow gastric emptying, increasing curcumin contact time",
        "Ayurveda");
    }

    // === 3. Guduchi ===
    const guduchi = this.findOrCreatePlant("Guduchi", "Tinospora cordifolia", "Stem");
    guduchi.alt_names = ["Giloy (Hindi)", "Amrita (Sanskrit)", "Heart-leaved Moonseed", "Seenthil (Tamil)"];
    guduchi.description = "Known as 'Amrita' (divine nectar) in Ayurveda. Powerful immunomodulator used for chronic fever, liver support, and inflammatory conditions. The stem is the primary medicinal part, ideally harvested when climbing a neem tree (Neem-Giloy) for enhanced potency.";
    guduchi.historical = "Referenced extensively in the Charaka Samhita and Sushruta Samhita. Called 'Amrita' meaning nectar of immortality, reflecting its status as one of Ayurveda's most valued herbs. Used for centuries for fever management (Jwarahara) and as a medhya rasayana (intellect rejuvenative).";
    linkTradition(guduchi, "ayurveda");
    linkCondition(guduchi, "General Inflammation");
    linkCondition(guduchi, "Joint Pain");
    linkPrep(guduchi, "decoction");
    linkPrep(guduchi, "powder");
    linkPrep(guduchi, "juice");
    linkPrep(guduchi, "capsule");
    linkSubstance(guduchi, "Berberine");
    linkSubstance(guduchi, "Alkaloids");
    linkSubstance(guduchi, "Flavonoids");
    linkCaution(guduchi, "blood-sugar");
    linkCaution(guduchi, "autoimmune-conditions");
    linkCaution(guduchi, "pregnancy");
    if (ashwagandha) {
      addSynergy(guduchi, ashwagandha, "Immune modulation with adaptogenic stress support",
        "Tinosporin and cordifolioside (guduchi) activate macrophages and increase IL-2/IFN-γ; withanolides (ashwagandha) modulate HPA axis and normalize cortisol, preventing stress-induced immunosuppression; complementary immuno-adaptogenic action",
        "Ayurveda");
    }

    // === 4. Burdock ===
    const burdock = this.findOrCreatePlant("Burdock", "Arctium lappa", "Root");
    burdock.alt_names = ["Gobo (Japanese)", "Niúbàng (TCM)", "Greater Burdock", "Bardane (French)"];
    burdock.description = "Root used for skin conditions, liver support, and as a gentle detoxifying agent. Rich in inulin (prebiotic fiber) and antioxidants. Traditional alterative ('blood purifier') in European and TCM traditions. Key ingredient in the Essiac formula.";
    burdock.historical = "Used in European folk medicine since medieval times for skin eruptions and blood purification. Part of the Essiac formula popularized in the 1920s. In TCM, the seeds (niúbàng zi) treat sore throat and skin conditions. Widely cultivated in Japan as gobo, a staple root vegetable prized for its earthy flavor and prebiotic benefits.";
    linkTradition(burdock, "european-herbalism");
    linkTradition(burdock, "traditional-chinese-medicine");
    linkCondition(burdock, "General Inflammation");
    linkCondition(burdock, "Joint Pain");
    linkCondition(burdock, "Sore Throat");
    linkPrep(burdock, "decoction");
    linkPrep(burdock, "tea");
    linkPrep(burdock, "tincture");
    linkPrep(burdock, "poultice");
    linkSubstance(burdock, "Inulin");
    linkSubstance(burdock, "Quercetin");
    linkSubstance(burdock, "Flavonoids");
    linkCaution(burdock, "pregnancy");
    linkCaution(burdock, "allergic-reactions");

    // === 5. He Shou Wu ===
    const heShouWu = this.findOrCreatePlant("He Shou Wu", "Reynoutria multiflora", "Root (processed)");
    heShouWu.alt_names = ["Fo-Ti", "Fleeceflower Root", "Polygonum multiflorum"];
    heShouWu.description = "One of TCM's premier longevity and blood-building herbs. The processed (zhì) form, steamed with black bean liquid, is used for premature graying, liver and kidney yin deficiency, and blood nourishment. Raw form is a laxative with entirely different properties — the two forms are not interchangeable.";
    heShouWu.historical = "Named after a legendary man whose gray hair returned to black after consuming it. One of the most prized tonic herbs in TCM, featured prominently in Ben Cao Gang Mu by Li Shizhen. The processing method (nine cycles of steaming with black bean liquid) is considered essential for transforming its therapeutic nature from laxative to blood-nourishing tonic.";
    linkTradition(heShouWu, "traditional-chinese-medicine");
    linkCondition(heShouWu, "Poor Circulation");
    linkCondition(heShouWu, "General Inflammation");
    linkPrep(heShouWu, "decoction");
    linkPrep(heShouWu, "powder");
    linkPrep(heShouWu, "tincture");
    linkPrep(heShouWu, "capsule");
    linkSubstance(heShouWu, "Resveratrol");
    linkSubstance(heShouWu, "Anthraquinones");
    linkSubstance(heShouWu, "Flavonoids");
    linkCaution(heShouWu, "liver-conditions");
    linkCaution(heShouWu, "pregnancy");
    linkCaution(heShouWu, "drug-interactions");

    // === 6. Tamarind ===
    const tamarind = this.findOrCreatePlant("Tamarind", "Tamarindus indica", "Fruit pulp");
    tamarind.alt_names = ["Imli (Hindi/Urdu)", "Tamr Hindi (Arabic)", "Asam (Malay)", "Tamarindo (Spanish)"];
    tamarind.description = "Fruit pulp used as a digestive aid, gentle laxative, and cooling agent for fever. Rich in tartaric acid, giving it its distinctive sour taste. The leaves and bark have additional antimicrobial properties. A culinary-medicinal plant bridging food and pharmacy across tropical traditions.";
    tamarind.historical = "One of the few plants used medicinally across African, Asian, and American tropical traditions independently. The name derives from Arabic 'tamr hindī' (Indian date). Referenced in Ayurvedic texts for digestive disorders and fever. Unani texts use it as a cooling agent for bilious conditions. In African traditional medicine, leaf decoctions treat malaria and fever.";
    linkTradition(tamarind, "ayurveda");
    linkTradition(tamarind, "unani");
    linkCondition(tamarind, "Nausea");
    linkCondition(tamarind, "Loss of Appetite");
    linkCondition(tamarind, "General Inflammation");
    linkPrep(tamarind, "decoction");
    linkPrep(tamarind, "juice");
    linkPrep(tamarind, "paste");
    linkSubstance(tamarind, "Tartaric acid");
    linkSubstance(tamarind, "Flavonoids");
    linkSubstance(tamarind, "Tannins");
    linkCaution(tamarind, "blood-sugar");
    linkCaution(tamarind, "gi-upset");
    linkCaution(tamarind, "drug-interactions");

    // === 7. Moringa ===
    const moringa = this.findOrCreatePlant("Moringa", "Moringa oleifera", "Leaves, Seeds");
    moringa.alt_names = ["Drumstick Tree", "Sahajan (Hindi)", "Ben Oil Tree", "Miracle Tree"];
    moringa.description = "One of the most nutrient-dense plants known — every part is used medicinally. Leaves are exceptionally rich in vitamins, minerals, and complete protein. Used for malnutrition, inflammation, blood sugar regulation, and as a galactagogue (milk production stimulant).";
    moringa.historical = "Called 'the miracle tree' for its extraordinary nutritional density. Used in Ayurveda for over 4000 years, classified as both food and medicine. Referenced in Siddha medicine as Sigru. Now cultivated globally in nutrition programs across developing countries due to fast growth, drought tolerance, and exceptional nutrient profile.";
    linkTradition(moringa, "ayurveda");
    linkCondition(moringa, "General Inflammation");
    linkCondition(moringa, "Joint Pain");
    linkCondition(moringa, "Loss of Appetite");
    linkPrep(moringa, "powder");
    linkPrep(moringa, "tea");
    linkPrep(moringa, "capsule");
    linkPrep(moringa, "oil");
    linkSubstance(moringa, "Quercetin");
    linkSubstance(moringa, "Kaempferol");
    linkSubstance(moringa, "Isothiocyanates");
    linkCaution(moringa, "pregnancy");
    linkCaution(moringa, "blood-sugar");
    linkCaution(moringa, "blood-pressure");

    // === 8. Wild Yam ===
    const wildYam = this.findOrCreatePlant("Wild Yam", "Dioscorea villosa", "Root/Rhizome");
    wildYam.alt_names = ["Colic Root", "Mexican Wild Yam", "Rheumatism Root"];
    wildYam.description = "Root used traditionally for menstrual cramps, digestive colic, and inflammatory conditions. Contains diosgenin, a steroidal saponin used as a pharmaceutical precursor. Note: despite marketing claims, the human body cannot convert diosgenin to progesterone — it lacks the necessary enzymes.";
    wildYam.historical = "Used by Native Americans and later Eclectic physicians for colic and menstrual pain. Diosgenin from wild yam was the starting material for Russell Marker's landmark 1943 synthesis of progesterone, launching the pharmaceutical steroid industry and enabling the contraceptive pill — making it one of the most commercially significant medicinal plants in history.";
    linkTradition(wildYam, "european-herbalism");
    linkCondition(wildYam, "Menstrual Pain");
    linkCondition(wildYam, "Joint Pain");
    linkCondition(wildYam, "General Inflammation");
    linkPrep(wildYam, "decoction");
    linkPrep(wildYam, "tincture");
    linkPrep(wildYam, "capsule");
    linkPrep(wildYam, "cream");
    linkSubstance(wildYam, "Diosgenin");
    linkSubstance(wildYam, "Saponins");
    linkCaution(wildYam, "pregnancy");
    linkCaution(wildYam, "estrogenic-effects");
    linkCaution(wildYam, "gi-upset");

    // === 9. Tribulus ===
    const tribulus = this.findOrCreatePlant("Tribulus", "Tribulus terrestris", "Fruit, Root");
    tribulus.alt_names = ["Gokshura (Ayurveda)", "Puncture Vine", "Caltrop", "Bai Ji Li (TCM)"];
    tribulus.description = "Fruit and root used for urinary tract health, kidney stone prevention, and traditionally for vitality. Contains steroidal saponins including protodioscin. Used in Ayurveda primarily as a mutrala (urinary tonic) and in TCM for liver qi stagnation and eye conditions.";
    tribulus.historical = "One of the few plants used across Ayurveda, Unani, and TCM for similar indications. Ayurvedic texts classify Gokshura as a rasayana for the urinary and reproductive systems. In TCM, Bai Ji Li is used for liver qi stagnation and eye conditions. Bulgarian research in the 1990s popularized it globally as a sports supplement.";
    linkTradition(tribulus, "ayurveda");
    linkTradition(tribulus, "unani");
    linkTradition(tribulus, "traditional-chinese-medicine");
    linkCondition(tribulus, "General Inflammation");
    linkCondition(tribulus, "Joint Pain");
    linkPrep(tribulus, "powder");
    linkPrep(tribulus, "decoction");
    linkPrep(tribulus, "capsule");
    linkPrep(tribulus, "tincture");
    linkSubstance(tribulus, "Protodioscin");
    linkSubstance(tribulus, "Saponins");
    linkSubstance(tribulus, "Flavonoids");
    linkCaution(tribulus, "pregnancy");
    linkCaution(tribulus, "blood-sugar");
    linkCaution(tribulus, "kidney-conditions");

    // === 10. Arjuna ===
    const arjuna = this.findOrCreatePlant("Arjuna", "Terminalia arjuna", "Bark");
    arjuna.alt_names = ["Arjun Tree", "Kakubha (Sanskrit)", "Nadisarjja", "Marudhu (Tamil)"];
    arjuna.description = "Bark used as the premier cardiac tonic in Ayurveda. Strengthens heart muscle, regulates blood pressure, reduces cholesterol, and acts as a mild diuretic. Traditionally prepared as a decoction in milk (Kshirapaka) for enhanced absorption of cardioprotective compounds.";
    arjuna.historical = "Named after the Mahabharata warrior Arjuna, symbolizing strength and protection. Referenced in the Ashtanga Hridaya and Charaka Samhita as the primary heart tonic (Hridayottama). Vagbhata specifically prescribed Arjuna bark decoction in milk for heart disease. Modern clinical trials confirm cardioprotective effects including reduced angina frequency and improved ejection fraction.";
    linkTradition(arjuna, "ayurveda");
    linkCondition(arjuna, "Poor Circulation");
    linkCondition(arjuna, "General Inflammation");
    linkPrep(arjuna, "decoction");
    linkPrep(arjuna, "powder");
    linkPrep(arjuna, "capsule");
    linkSubstance(arjuna, "Arjunolic acid");
    linkSubstance(arjuna, "Tannins");
    linkSubstance(arjuna, "Flavonoids");
    linkSubstance(arjuna, "Saponins");
    linkCaution(arjuna, "blood-pressure");
    linkCaution(arjuna, "heart-conditions");
    linkCaution(arjuna, "blood-thinners");
    linkCaution(arjuna, "pregnancy");
    if (ashwagandha) {
      addSynergy(arjuna, ashwagandha, "Cardioprotective with stress-adaptation support",
        "Arjunolic acid strengthens myocardial tissue and reduces oxidative stress on cardiac cells; withanolides modulate the HPA axis reducing cortisol-mediated cardiovascular strain; combined effect reduces both mechanical and neuroendocrine cardiac stressors",
        "Ayurveda");
    }

    console.log(`  Supplementary plants: 10 added`);
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
