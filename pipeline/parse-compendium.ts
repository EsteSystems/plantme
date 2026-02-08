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
    "Phenolic ketone found in fresh ginger rhizome. Primary bioactive: 6-gingerol is a potent 5-HT3 receptor antagonist (anti-emetic) and COX-2 inhibitor. Drying converts gingerols to shogaols (2× more pungent, stronger anti-inflammatory) and zingerone (less pungent, retains anti-nausea activity). Boiling partially degrades gingerols but produces dehydrated gingerdiols with antioxidant activity. Alcohol tincture preserves gingerols effectively. Fermentation (as in ginger beer) reduces gingerol content significantly.",

  "Allicin":
    "Thiosulfinate compound produced when garlic cloves are crushed or chopped, via alliinase acting on alliin. Extremely unstable — half-life ~16 hours at 23°C. Potent broad-spectrum antimicrobial that disrupts bacterial membranes via thiol-disulfide exchange. Cooking rapidly destroys allicin; even 60 seconds of microwaving eliminates most activity. Drying preserves alliin (the precursor) but not allicin itself. Alcohol tincture of fresh garlic captures some allicin but it degrades to diallyl disulfide and ajoene (anti-thrombotic). Crushing and waiting 10 minutes before cooking maximizes allicin formation. Fermented black garlic contains S-allyl cysteine instead — a stable, bioavailable antioxidant with different pharmacology.",

  "Eugenol":
    "Phenylpropanoid found in clove buds, holy basil, and cinnamon leaf oil. Strong COX-2 inhibitor and local anaesthetic — numbs tissue on contact via sodium channel blockade. Also potent antimicrobial against both gram-positive and gram-negative bacteria. Heat-stable: survives boiling and decoction well. Alcohol extracts eugenol efficiently (>90% recovery in tincture). Drying concentrates eugenol as water evaporates. Oxidation converts eugenol to eugenol oxide and dieugenol, which are less bioactive. In clove oil, eugenol comprises 72–90% of volatile fraction.",

  "Curcumin":
    "Diarylheptanoid polyphenol responsible for turmeric's yellow color. Inhibits NF-κB, COX-2, and LOX — broad anti-inflammatory. Extremely poor oral bioavailability (<1%) due to rapid hepatic glucuronidation and intestinal metabolism. Piperine (black pepper) increases absorption ~2000% by inhibiting glucuronidation. Lipids enhance absorption via micellar solubilization. Boiling in water extracts only ~10% of curcumin; simmering in fat/oil extracts much more. Alcohol tincture is effective for extraction. Drying preserves curcumin well. Heat degrades curcumin above 180°C into vanillin, ferulic acid, and feruloylmethane — all mildly anti-inflammatory but less potent.",

  "Menthol":
    "Cyclic monoterpene alcohol from peppermint oil. Activates TRPM8 cold receptors producing cooling sensation. Antispasmodic on GI smooth muscle via calcium channel blockade — basis of enteric-coated peppermint oil capsules for IBS. Volatile: boiling drives off menthol rapidly (peppermint tea should be steeped covered, not boiled). Drying reduces menthol content by 20–40%. Alcohol tincture preserves menthol effectively. Topically acts as counterirritant and mild local anaesthetic. Metabolized hepatically to menthol glucuronide.",

  "Salicin":
    "Phenolic glucoside found in willow bark, meadowsweet, and poplar. Prodrug: converted by gut flora and liver to salicylic acid (the active metabolite, same as aspirin's mechanism). Inhibits COX-1 and COX-2 but with slower onset and longer duration than aspirin. Boiling/decoction extracts salicin effectively — traditional willow bark tea. Alcohol tincture also extracts well. Drying preserves salicin. Unlike aspirin, salicin does not acetylate platelets irreversibly, so anti-platelet effect is weaker. Meadowsweet's tannins buffer the gastric irritation that pure salicylates cause.",

  "Berberine":
    "Isoquinoline alkaloid found in goldenseal, Oregon grape, and barberry. Bright yellow color. Activates AMPK pathway — improves insulin sensitivity and glucose metabolism. Antimicrobial against bacteria, fungi, and protozoa. Poor oral bioavailability (~5%) due to P-glycoprotein efflux in gut. Heat-stable: survives decoction. Alcohol tincture extracts berberine efficiently (it is soluble in ethanol). Drying preserves berberine well. Synergistic with 5′-methoxyhydnocarpin (found in same plants), which inhibits bacterial efflux pumps.",

  "Thymol":
    "Monoterpene phenol found in thyme and oregano. Potent antimicrobial — disrupts bacterial cell membranes and inhibits biofilm formation. Also acts as bronchospasmolytic, relaxing airway smooth muscle. Moderately volatile: boiling drives off some thymol (cover tea while steeping). Drying reduces thymol content somewhat. Alcohol tincture extracts and preserves thymol very effectively. Used in commercial mouthwash (Listerine) at ~0.06%. Heating above 230°C decomposes thymol. Synergistic with carvacrol (its isomer) — together more antimicrobial than either alone.",

  "Rosmarinic acid":
    "Phenolic acid ester found in rosemary, lemon balm, sage, holy basil, and many Lamiaceae. Inhibits GABA-transaminase, increasing synaptic GABA levels (anxiolytic). Also inhibits complement activation (anti-inflammatory) and has strong antioxidant activity (ORAC value higher than vitamin E). Water-soluble: extracts well in tea/decoction. Heat-stable up to ~150°C. Alcohol tincture preserves it effectively. Drying preserves rosmarinic acid well — dried herbs retain most activity. Not significantly degraded by fermentation.",

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
    "Triterpene saponin from licorice root, 50× sweeter than sucrose. Inhibits 11β-hydroxysteroid dehydrogenase type 2, increasing cortisol activity — anti-inflammatory but can cause pseudoaldosteronism (hypertension, hypokalemia) with chronic high-dose use. Also antiviral (inhibits viral penetration and replication). Well-extracted by boiling — traditional decoction herb. Alcohol tincture effective. Drying preserves glycyrrhizin. DGL (deglycyrrhizinated licorice) has glycyrrhizin removed to avoid mineralocorticoid side effects while retaining mucosal-protective flavonoids.",

  "Silymarin":
    "Flavonolignan complex from milk thistle seeds, comprising silybin (most active), silydianin, and silychristin. Potent hepatoprotective: stabilizes hepatocyte membranes, stimulates ribosomal RNA polymerase (promoting liver cell regeneration), and scavenges free radicals. Poorly water-soluble — tea extracts only ~10% of silymarin. Alcohol tincture extracts significantly more. Standardized extracts (70–80% silymarin) are most clinically effective. Drying preserves silymarin. Heat-stable up to ~160°C. Phosphatidylcholine complexes (phytosomes) dramatically improve oral bioavailability.",

  "Withanolides":
    "Steroidal lactones unique to ashwagandha (Withania somnifera). Withaferin A and withanolide D are most studied. Modulate HPA axis — normalize cortisol under chronic stress (adaptogenic). Also inhibit NF-κB (anti-inflammatory) and enhance GABAergic signaling (anxiolytic). Lipophilic: poorly extracted by water alone. Traditional Ayurvedic preparation simmers ashwagandha in milk (fat enhances extraction). Alcohol tincture extracts withanolides effectively. Drying preserves withanolides well — root is typically used dried and powdered. Heat-stable under normal cooking temperatures.",

  "Boswellic acids":
    "Pentacyclic triterpene acids from Boswellia serrata resin (frankincense). AKBA (acetyl-11-keto-β-boswellic acid) is the most potent — selectively inhibits 5-lipoxygenase, reducing leukotriene synthesis. Also inhibits topoisomerase and NF-κB. Lipophilic: poorly water-soluble. Alcohol tincture extracts boswellic acids moderately. Best administered as standardized extract or with lipid vehicles. Drying preserves boswellic acids (resin is naturally dry). Heat does not significantly degrade them. Traditional use burns resin as incense — inhalation delivers some volatile terpenes but not the non-volatile boswellic acids.",

  "Harpagosides":
    "Iridoid glycosides from devil's claw (Harpagophytum procumbens) tuber. Anti-inflammatory via COX-2 and TNF-α inhibition. Also analgesic — used for joint pain and back pain. Heat-sensitive: boiling degrades harpagosides significantly. Water extraction (cold or warm infusion) is traditional. Alcohol tincture preserves harpagosides well. Drying at low temperature preserves activity; high-temperature drying degrades them. Gastric acid can partially hydrolyze the glycoside bond, but harpagosides are absorbed intact in the duodenum. Standardized extracts typically contain 2–3% harpagosides.",

  "Valerenic acid":
    "Sesquiterpene acid found in valerian root. Positive allosteric modulator of GABA-A receptors — enhances GABA binding without acting as a direct agonist (unlike benzodiazepines). Anxiolytic and sedative without morning grogginess. Also inhibits GABA breakdown by inhibiting GABA-transaminase. Moderately volatile: some loss during boiling. Alcohol tincture is the preferred extraction method — ethanol extracts valerenic acid efficiently. Drying at room temperature preserves it; heat-drying above 40°C causes significant loss. Fresh root has more isovaleric acid (the distinctive odor) but dried root has more valerenic acid (concentration effect). Standardized extracts contain 0.8–1% valerenic acid.",

  "Piperine":
    "Alkaloid responsible for black pepper's pungency. Potent bioenhancer: inhibits hepatic and intestinal glucuronidation (UGT enzymes), CYP3A4, and P-glycoprotein efflux pumps — dramatically increasing bioavailability of co-administered compounds (curcumin +2000%, CoQ10 +30%). Also activates TRPV1 receptors (thermogenic). Heat-stable: survives cooking temperatures. Drying preserves piperine. Alcohol tincture extracts piperine effectively. Caution: piperine's enzyme inhibition can increase blood levels of pharmaceutical drugs (similar mechanism to grapefruit juice).",

  "Capsaicin":
    "Vanilloid compound responsible for chili pepper heat. Binds TRPV1 receptors on C-fiber nociceptors — initial activation causes burning pain, but prolonged exposure depletes substance P, producing analgesia (basis of capsaicin cream for neuropathic pain). Thermogenic: increases metabolic rate via sympathetic activation. Heat-stable: survives all cooking temperatures. Drying concentrates capsaicin — dried cayenne is more potent than fresh. Alcohol tincture extracts capsaicin efficiently (cayenne tincture). Not significantly water-soluble — oil or alcohol are better solvents. Scoville heat units measure capsaicin content. Dihydrocapsaicin (found alongside capsaicin) has similar but slightly less potent activity.",

  "Catechins":
    "Flavan-3-ol polyphenols, primarily from tea (Camellia sinensis). EGCG (epigallocatechin gallate) is most studied — antioxidant, anti-inflammatory, thermogenic, and anti-angiogenic. Green tea preserves catechins (unoxidized); black tea fermentation converts catechins to theaflavins and thearubigins (different activity profile). Hot water extraction at 70–80°C is optimal — boiling water degrades EGCG. Drying preserves catechins if done quickly. Alcohol tincture extracts catechins well. Adding lemon juice (vitamin C) stabilizes catechins in solution. Milk proteins bind catechins, reducing bioavailability.",

  "Anthocyanins":
    "Water-soluble vacuolar pigments (red, purple, blue) found in elderberry, bilberry, hibiscus, and many berries. Antioxidant and anti-inflammatory — inhibit NF-κB and COX-2. Also antiviral: elderberry anthocyanins inhibit viral neuraminidase. pH-dependent color: red in acid, blue in alkaline, colorless at neutral pH. Heat-sensitive: boiling degrades anthocyanins 20–50% depending on duration. Drying causes some loss but freeze-drying preserves well. Alcohol tincture preserves anthocyanins effectively (acidified ethanol is best). Fermentation (as in wine) preserves some anthocyanins but converts others to pyranoanthocyanins. Rapid oral absorption but short plasma half-life (~2 hours).",

  "Proanthocyanidins":
    "Oligomeric and polymeric flavan-3-ols (condensed tannins). Found in cranberry, grape seed, pine bark, hawthorn. Cranberry A-type PACs specifically prevent E. coli adhesion to uroepithelium (UTI prevention) — B-type PACs (grape, pine bark) do not share this activity. Strong antioxidant (ORAC values exceed vitamin C and E). Vasoprotective: strengthen capillary walls, reduce edema. Water-soluble: extract in tea. Heat-stable. Alcohol tincture extracts effectively. Drying preserves proanthocyanidins well. Polymerization increases with storage — very large polymers are poorly absorbed.",

  "Inulin":
    "Fructo-oligosaccharide (prebiotic fiber) found in chicory root, dandelion root, and elecampane. Not digested by human enzymes — fermented by Bifidobacterium and Lactobacillus in the colon, producing short-chain fatty acids (butyrate, propionate) that nourish colonocytes and reduce pH. Enhances calcium and magnesium absorption. Water-soluble: extracts well in hot water. Heat converts inulin to shorter-chain fructooligosaccharides (still prebiotic). Roasting (as in chicory coffee substitute) caramelizes inulin. Drying preserves inulin. Alcohol does not extract inulin efficiently. Excessive intake can cause flatulence and bloating.",

  "Beta-glucans":
    "Polysaccharides with β-glycosidic bonds, found in medicinal mushrooms (reishi, lion's mane, shiitake) and oats. β-1,3/1,6-glucans (fungal) activate innate immune system via Dectin-1 receptors on macrophages and dendritic cells — immunomodulatory, not immunostimulant. Oat β-1,3/1,4-glucans lower cholesterol by binding bile acids. Require hot water extraction (decoction) to break chitin cell walls of mushrooms. Alcohol alone does NOT extract beta-glucans. Dual extraction (hot water + alcohol) captures both beta-glucans and triterpenes. Drying preserves beta-glucans. Not degraded by normal cooking temperatures.",

  "Allantoin":
    "Diureide of glyoxylic acid found in comfrey (Symphytum). Promotes cell proliferation and wound healing by stimulating fibroblast activity and increasing extracellular matrix synthesis. Also moisturizing and keratolytic (softens skin). Water-soluble: extracts in tea or poultice. Heat-stable. Alcohol tincture extracts allantoin moderately. Drying preserves allantoin. Used topically for wound healing, burns, and ulcers. Note: comfrey also contains hepatotoxic pyrrolizidine alkaloids — topical use is preferred over internal use. Synthetic allantoin is widely used in commercial skincare.",

  "Hypericin":
    "Naphthodianthrone pigment from St. John's wort (Hypericum perforatum). Photosensitizer: absorbs UV light and generates reactive oxygen species — basis of both phototoxicity risk and potential photodynamic therapy applications. Antiviral activity against enveloped viruses. Contributes to antidepressant effect along with hyperforin. Water extraction (tea) yields some hypericin. Alcohol tincture extracts hypericin efficiently — standardized extracts typically contain 0.3% hypericin. Light-sensitive: degrades with UV exposure (store tinctures in dark bottles). Drying in shade preserves hypericin; sun-drying degrades it. Oil infusions (St. John's wort oil) turn red from hypericin extraction into lipids.",

  "Hyperforin":
    "Phloroglucinol derivative from St. John's wort. Primary antidepressant compound: inhibits reuptake of serotonin, norepinephrine, dopamine, GABA, and glutamate via TRPC6 channel activation — unique multi-transmitter mechanism. Also antibacterial (active against MRSA). Extremely unstable: oxidizes rapidly when exposed to light and air. Alcohol tincture must be made from fresh plant and stored in dark, airtight bottles. Drying causes significant hyperforin loss unless done rapidly in darkness. Not well-extracted by water. CO2 supercritical extraction is the gold standard for stable hyperforin. Standardized extracts aim for 3–5% hyperforin. Potent CYP3A4 inducer — causes drug interactions.",

  "Ginkgolides":
    "Diterpene trilactones unique to Ginkgo biloba. Ginkgolide B is the most pharmacologically active — potent and specific antagonist of platelet-activating factor (PAF), reducing platelet aggregation and improving microcirculation. Also neuroprotective via anti-inflammatory and antioxidant mechanisms. Heat-stable: survive decoction (traditional Chinese preparation). Alcohol tincture extracts ginkgolides efficiently. Standardized extract (EGb 761) contains 6% terpene trilactones (ginkgolides + bilobalide). Drying preserves ginkgolides well — leaves are typically dried before extraction. Not significantly degraded by fermentation.",

  "Bilobalide":
    "Sesquiterpene trilactone unique to Ginkgo biloba. Neuroprotective: preserves mitochondrial function during ischemia, inhibits glycine receptor-mediated neurotoxicity, and reduces cerebral edema. Works synergistically with ginkgolides for cognitive benefits. Similar extraction and stability profile to ginkgolides — heat-stable, well-extracted by alcohol, preserved by drying. Standardized ginkgo extracts typically contain ~3% bilobalide. Crosses the blood-brain barrier. More potent neuroprotectant than ginkgolides in animal stroke models.",

  "Chamazulene":
    "Sesquiterpene not present in fresh chamomile — formed during steam distillation from matricin (a sesquiterpene lactone) via heat-induced decomposition. Gives chamomile essential oil its characteristic blue color. Potent anti-inflammatory: inhibits leukotriene B4 synthesis and reduces histamine release. Present in steam-distilled oil but NOT in water infusions (tea) or alcohol tinctures — these contain matricin instead, which is also anti-inflammatory but less potent. Drying preserves matricin (the precursor). Topical application of chamomile oil delivers chamazulene directly. Degrades with prolonged light exposure.",

  "Bisabolol":
    "Monocyclic sesquiterpene alcohol found in chamomile essential oil. Anti-inflammatory (inhibits COX-2), wound-healing, and antimicrobial. Unlike chamazulene, bisabolol IS present in the fresh plant. Moderately volatile: some loss during boiling (steep covered). Alcohol tincture preserves bisabolol well. Drying causes moderate loss of bisabolol. Steam distillation recovers bisabolol efficiently. Used in commercial skincare for its anti-irritant properties. α-bisabolol is the naturally occurring enantiomer and is more active than synthetic racemic bisabolol.",

  "Aucubin":
    "Iridoid glycoside found in plantain (Plantago), eyebright, and mullein. Anti-inflammatory, hepatoprotective, and antimicrobial. Converted by gut bacteria to aucubigenin (the active aglycone), which is more potent. Water-soluble: extracts well in tea and decoctions. Heat partially stable — short boiling is fine, prolonged heating degrades it. Alcohol tincture extracts aucubin efficiently. Drying at low temperature preserves aucubin; high-heat drying causes degradation. Fresh plantain poultice delivers aucubin directly to wounds. Also has neuroprotective properties in animal models.",

  "Arbutin":
    "Hydroquinone glucoside found in uva-ursi (bearberry), cranberry, and pear. Prodrug: hydrolyzed by gut bacteria to hydroquinone, which is excreted in urine as an antimicrobial — active against E. coli and other urinary pathogens. Requires alkaline urine (pH >8) for optimal antibacterial activity — traditionally taken with sodium bicarbonate. Water-soluble: extracts well in tea. Heat-stable. Alcohol tincture also effective. Drying preserves arbutin well. Urine must be alkaline for hydroquinone to remain un-ionized and bactericidal. Short-term use recommended due to theoretical hydroquinone toxicity concerns with chronic use.",

  "Ellagic acid":
    "Phenolic compound found in raspberry, pomegranate, strawberry, and walnut. Potent antioxidant: scavenges free radicals and chelates metal ions. Anti-proliferative: induces apoptosis in abnormal cells via p53 activation. Gut bacteria convert ellagic acid to urolithins (A, B, C), which have distinct anti-inflammatory and anti-aging properties — urolithin production varies between individuals based on microbiome composition. Moderately water-soluble. Heat-stable: survives boiling and jam-making. Drying preserves ellagic acid. Alcohol tincture extracts it efficiently. Concentrated in seeds and peel rather than fruit flesh.",

  "Cinnamaldehyde":
    "Phenylpropanoid aldehyde responsible for cinnamon's flavor and aroma. Antimicrobial: disrupts bacterial quorum sensing and biofilm formation. Also improves insulin sensitivity via AMPK activation and GLUT4 translocation. Moderately volatile: some loss with boiling, but enough survives in cinnamon tea to be bioactive. Alcohol tincture extracts cinnamaldehyde very effectively. Drying preserves it well (cinnamon bark is used dried). Cassia cinnamon contains more cinnamaldehyde than Ceylon cinnamon but also more coumarin (hepatotoxic at high doses). Oxidation converts cinnamaldehyde to cinnamic acid (less bioactive). Oil of cinnamon is 65–80% cinnamaldehyde.",

  "Anethole":
    "Phenylpropanoid ether responsible for the sweet licorice-like flavor of fennel, anise, and star anise. Antispasmodic on GI smooth muscle via calcium channel modulation. Also estrogenic activity (structural similarity to catecholamines and dopamine). Carminative: reduces intestinal gas. Volatile: partially lost during boiling (fennel tea should be steeped covered). Alcohol tincture preserves anethole well. Drying causes moderate anethole loss. Trans-anethole is the naturally occurring, bioactive isomer; cis-anethole is toxic but rarely found naturally. Not significantly altered by fermentation. Fennel seed is 80–90% anethole by essential oil composition.",

  "Parthenolide":
    "Sesquiterpene lactone from feverfew (Tanacetum parthenium). Primary mechanism: inhibits NF-κB by alkylating cysteine residues, reducing production of pro-inflammatory cytokines (TNF-α, IL-1). Also inhibits platelet aggregation and serotonin release from platelets — basis of migraine prevention use. Unstable: degrades significantly during drying, especially with heat. Fresh plant or freeze-dried preparations are most potent. Alcohol tincture from fresh herb preserves parthenolide better than dried preparations. Boiling degrades parthenolide substantially. Standardized extracts aim for 0.2–0.4% parthenolide. Chewing fresh leaves is the traditional (though bitter) delivery method.",

  "Petasin":
    "Sesquiterpene ester from butterbur (Petasites hybridus). Antispasmodic: relaxes smooth muscle in bronchi and blood vessels. Used for migraine prevention and allergic rhinitis (comparable efficacy to cetirizine in clinical trials). Inhibits leukotriene synthesis and calcium channel influx. Raw butterbur contains hepatotoxic pyrrolizidine alkaloids (PAs) — only PA-free standardized extracts (like Petadolex) are safe. Boiling does NOT remove PAs. Alcohol tincture does not remove PAs. Only industrial CO2 extraction reliably removes PAs while preserving petasin. Drying does not affect petasin stability significantly.",

  "Kavalactones":
    "Lipophilic lactones from kava root (Piper methysticum), including kavain, dihydrokavain, methysticin, and yangonin. Anxiolytic: potentiate GABA-A receptors, block voltage-gated sodium channels, inhibit MAO-B, and modulate cannabinoid CB1 receptors — multi-target mechanism. Traditional preparation: cold water extraction of fresh root (knead root in water). Alcohol tincture extracts kavalactones efficiently but may extract hepatotoxic compounds not present in water extract. Boiling degrades some kavalactones. Drying preserves kavalactones well. Traditional fermentation is not typically applied to kava. Noble cultivars contain mainly kavain and dihydrokavain (desirable anxiolytics); tudei cultivars contain more dihydromethysticin (more sedating, potentially hepatotoxic).",

  "Resveratrol":
    "Stilbene polyphenol found in grape skin, Japanese knotweed, and peanuts. Activates SIRT1 (sirtuin) — implicated in longevity and metabolic health. Anti-inflammatory via NF-κB and COX-2 inhibition. Antioxidant and cardioprotective. Low oral bioavailability (~1%) due to rapid hepatic sulfation and glucuronidation. Red wine contains resveratrol (fermentation extracts it from grape skins), but amounts are modest. Alcohol tincture of Japanese knotweed is a concentrated source. Heat-stable under normal conditions. Drying preserves resveratrol. Trans-resveratrol is the bioactive form; UV light isomerizes it to less-active cis-resveratrol.",

  "Oleuropein":
    "Secoiridoid glycoside from olive leaf and fruit. Potent antioxidant: scavenges superoxide and hydroxyl radicals. Antihypertensive via ACE inhibition and calcium channel blockade. Also antimicrobial and antiviral. Bitter taste contributes to olive flavor (removed during olive curing). Water-soluble: extracts well in tea. Alcohol tincture also effective. Drying preserves oleuropein well. Hydrolyzed by gut bacteria and esterases to hydroxytyrosol (also potently antioxidant and cardioprotective). During olive oil processing, oleuropein is partially converted to oleacein. Fermentation (olive brining) degrades oleuropein — cured olives contain much less than fresh leaves.",

  "Ephedrine":
    "Phenethylamine alkaloid from Ephedra (Ma Huang). Sympathomimetic: stimulates release of norepinephrine from sympathetic neurons. Bronchodilator (β2-adrenergic activation), decongestant (α-adrenergic vasoconstriction), CNS stimulant, thermogenic. Heat-stable: traditional Chinese decoction method is effective. Alcohol tincture extracts ephedrine efficiently. Drying preserves ephedrine well — dried herb is the standard form. Pseudoephedrine (stereoisomer) has similar decongestant but less CNS stimulant activity. Cardiovascular risks: hypertension, arrhythmia, stroke at high doses. Regulated substance in many jurisdictions due to use as methamphetamine precursor.",

  "Cineole":
    "Bicyclic monoterpene ether (also called eucalyptol or 1,8-cineole). Found in eucalyptus, tea tree, cardamom, rosemary, and bay laurel. Mucolytic: thins respiratory mucus by reducing mucin production. Bronchodilatory via anti-inflammatory action (inhibits TNF-α, IL-1β). Also antimicrobial against respiratory pathogens. Volatile: significantly lost during boiling — steam inhalation captures cineole effectively. Alcohol tincture preserves cineole well. Drying causes 30–50% cineole loss. Absorbed through skin and lungs as well as GI tract. Hepatically metabolized to 2-hydroxycineole. Well-tolerated at normal doses; large doses of isolated eucalyptus oil can cause seizures.",

  "Linalool":
    "Monoterpene alcohol found in lavender, coriander, basil, and many aromatic plants. Anxiolytic: modulates glutamate binding at NMDA receptors (not via GABA). Also anti-inflammatory (inhibits LPS-induced NF-κB) and local anaesthetic. Readily absorbed via inhalation — basis of lavender aromatherapy for anxiety and sleep. Volatile: partially lost during boiling. Alcohol tincture preserves linalool well. Drying causes 20–40% linalool loss. S-(+)-linalool (lavender) and R-(-)-linalool (coriander) are enantiomers with similar but not identical pharmacology. Metabolized hepatically to linalool oxide. Used widely in perfumery and cosmetics.",

  "Baicalin":
    "Flavone glycoside found in skullcap (Scutellaria baicalensis and S. lateriflora). Anti-inflammatory: inhibits 12/15-lipoxygenase and COX-2. Also antiviral (inhibits viral replication), neuroprotective (reduces excitotoxicity), and anxiolytic (binds benzodiazepine site on GABA-A receptors). Hydrolyzed by gut bacteria to baicalein (aglycone), which crosses the blood-brain barrier more readily. Water-soluble: extracts well in decoction (traditional Chinese method). Alcohol tincture also effective. Drying preserves baicalin. Heat-stable. Chinese skullcap root contains much higher baicalin levels than American skullcap (which acts more via flavonoids and diterpenes).",

  "Kaempferol":
    "Flavonol found in moringa, witch hazel, ginkgo, tea, and many fruits and vegetables. Structurally similar to quercetin with one fewer hydroxyl group. Anti-inflammatory: inhibits COX-2, iNOS, and NF-κB. Antioxidant: scavenges superoxide and peroxynitrite. Also neuroprotective and cardioprotective in preclinical studies. Moderate oral bioavailability — glycoside forms (from food) are better absorbed than free kaempferol. Water-soluble glycosides extract in tea; aglycone extracts better in alcohol. Heat-stable: survives boiling and cooking. Drying preserves kaempferol. Gut bacteria cleave glycoside bonds, releasing free kaempferol for absorption in the colon. Synergistic with quercetin for anti-inflammatory effects.",

  "Quercetin":
    "Flavonol found widely in onions, elderflower, stinging nettle, hawthorn, and many fruits and vegetables. Potent antioxidant and anti-inflammatory: inhibits COX-2, LOX, and NF-κB. Mast cell stabilizer — inhibits histamine release (anti-allergic). Also inhibits xanthine oxidase (anti-gout mechanism). Poorly bioavailable in aglycone form; glycoside forms (rutin, quercitrin) from food are better absorbed. Water-soluble glycosides extract in tea; aglycone extracts better in alcohol. Heat-stable: survives cooking. Drying preserves quercetin well. Gut bacteria deglycosylate quercetin glycosides for absorption. Onion skins contain 10× more quercetin than flesh.",

  "Apigenin":
    "Flavone found in chamomile, parsley, celery, and many Asteraceae. Binds GABA-A benzodiazepine receptors as a partial agonist — anxiolytic without strong sedation or dependence risk. Also anti-inflammatory (inhibits COX-2, iNOS) and anti-proliferative. Water-soluble glycoside (apigenin-7-glucoside) extracts well in chamomile tea. Alcohol tincture extracts both glycoside and aglycone forms. Heat-stable. Drying preserves apigenin. Relatively poor oral bioavailability (~30%) due to first-pass metabolism, but chamomile tea provides clinically relevant amounts. Not significantly affected by fermentation.",

  "Ricin":
    "Extremely toxic lectin (ribosome-inactivating protein) found in castor bean seeds. One of the most potent plant toxins — lethal dose ~1 μg/kg. Inhibits protein synthesis by depurinating ribosomal RNA. NOT present in castor oil — the oil extraction process denatures and removes ricin. Heating above 80°C for 10 minutes denatures ricin. Not volatile — no inhalation risk from seeds. Water extraction would dissolve ricin — castor bean tea would be toxic. Castor oil is safe because ricin is water-soluble but not oil-soluble, and the pressing and heating process eliminates any trace contamination.",

  "Podophyllotoxin":
    "Lignan found in mayapple (Podophyllum peltatum) rhizome. Potent antimitotic: inhibits tubulin polymerization, arresting cell division in metaphase. Too toxic for internal use in crude form. Semi-synthetic derivatives etoposide and teniposide are important chemotherapy drugs. Topical podophyllin resin (25% podophyllotoxin) used for genital warts. Alcohol tincture extracts podophyllotoxin efficiently. Water extraction is less effective (poorly water-soluble). Drying preserves podophyllotoxin. Heat-stable under normal conditions. Extremely toxic if ingested — causes severe GI damage, bone marrow suppression, and multiorgan failure.",

  "Aconitine":
    "Diterpenoid alkaloid from aconite (Aconitum species). Extremely toxic — lethal dose ~2–5 mg. Activates voltage-gated sodium channels, causing persistent depolarization of cardiac and neural tissue. Traditional Chinese and Ayurvedic processing (prolonged boiling/steaming) reduces aconitine to less toxic aconine and benzoylaconine derivatives — processed aconite (fu zi / zhi fu zi) has 1/200th the toxicity of raw. Alcohol tincture of raw aconite is EXTREMELY dangerous. Drying does NOT reduce toxicity. Only used after extensive processing in traditional formulas by experienced practitioners. Homeopathic preparations are diluted beyond pharmacological activity.",

  "Thymoquinone":
    "Monoterpene phenol from Nigella sativa (black seed). Primary bioactive compound responsible for most of black seed's pharmacological effects. Potent antioxidant: scavenges superoxide and inhibits lipid peroxidation. Anti-inflammatory via NF-κB and MAPK pathway inhibition. Immunomodulatory: enhances NK cell activity and macrophage function. Also hepatoprotective and nephroprotective. Moderately heat-stable: survives gentle cooking but prolonged high heat degrades it. Cold-pressed black seed oil preserves thymoquinone well (typically 0.5–1.5%). Alcohol tincture extracts thymoquinone efficiently. Drying preserves it. Roasting seeds at high temperature reduces thymoquinone content significantly. Bioavailability improved by co-administration with lipids.",

  "Anthraquinones":
    "Aromatic compounds found in senna, aloe, rhubarb, and He Shou Wu (Polygonum multiflorum). Stimulant laxatives: emodin and chrysophanol activate chloride channels in colonocytes, increasing water secretion and peristalsis via myenteric plexus stimulation. In He Shou Wu, processing (steaming with black bean liquid) converts free anthraquinones to bound glycoside forms — reducing laxative effect while retaining tonic properties. Raw form is strongly laxative; processed form is blood-nourishing. Water-soluble: extract well in decoction. Alcohol tincture also effective. Drying preserves anthraquinones. Chronic use of stimulant anthraquinones can cause melanosis coli and electrolyte imbalance. Emodin has additional anti-inflammatory and hepatoprotective effects at low doses.",

  "Tartaric acid":
    "Alpha-hydroxy dicarboxylic acid, the dominant organic acid in tamarind fruit (up to 16% by weight). Responsible for tamarind's intensely sour taste. Antimicrobial: inhibits bacterial growth by acidifying the environment. Mild laxative via osmotic water retention in the intestinal lumen. Acts as a natural chelator of iron and calcium — can enhance or inhibit mineral absorption depending on context. Heat-stable: survives boiling and cooking completely. Water-soluble: extracts fully in decoction and juice. Drying preserves tartaric acid. Not significantly affected by fermentation. Also found in grapes (as potassium bitartrate/cream of tartar). Used commercially as an acidulant and antioxidant synergist in food preservation.",

  "Diosgenin":
    "Steroidal sapogenin found in wild yam (Dioscorea villosa) and fenugreek. The aglycone of dioscin. Structurally similar to cholesterol and steroid hormones. Historically used as the starting material for industrial synthesis of progesterone, cortisone, and other steroid drugs (Russell Marker, 1943). The human body CANNOT convert diosgenin to progesterone — it lacks the necessary enzymatic machinery, despite persistent marketing claims. Anti-inflammatory: inhibits NF-κB and COX-2 in vitro. Also antispasmodic on smooth muscle. Extracted by prolonged boiling/decoction (saponins require heat to release). Alcohol tincture extracts diosgenin moderately. Drying preserves diosgenin well. Acid hydrolysis of dioscin yields diosgenin.",

  "Isothiocyanates":
    "Sulfur-containing compounds formed from glucosinolate precursors by myrosinase enzyme when plant tissue is crushed or chewed. Found in moringa (moringa isothiocyanate/MIC), cruciferous vegetables (sulforaphane from broccoli). Potent activators of Nrf2 pathway — upregulate phase II detoxification enzymes (glutathione S-transferase, NQO1). Anti-inflammatory: inhibit NF-κB activation. Moringa isothiocyanate is notably stable compared to sulforaphane. Cooking destroys myrosinase, reducing isothiocyanate formation from intact glucosinolates — light steaming preserves some activity. Drying moringa leaves preserves glucosinolate precursors; reconstituting with water can reactivate conversion. Fermentation may produce isothiocyanates if myrosinase-producing bacteria are present.",

  "Protodioscin":
    "Steroidal furostanol saponin found in Tribulus terrestris fruit and fenugreek. The primary bioactive saponin in Tribulus. Converted in the body to dehydroepiandrosterone (DHEA) — though the clinical significance of this conversion is debated. Enhances nitric oxide synthase (eNOS) activity, improving vasodilation. Also increases androgen receptor density in some tissues. Anti-urolithic: reduces calcium oxalate crystal formation and aggregation (basis of kidney stone prevention use). Water-soluble glycoside: extracts in decoction. Alcohol tincture also effective. Drying preserves protodioscin. Heat-stable under normal cooking temperatures. Standardized Tribulus extracts are typically standardized to 40–60% saponins (primarily protodioscin).",

  "Arjunolic acid":
    "Oleanane-type triterpenoid found in Terminalia arjuna bark. Primary cardioactive compound. Cardioprotective: acts as a mild inotrope (strengthens heart contraction force) without increasing heart rate, via modulation of intracellular calcium handling. Also antioxidant — protects myocardial tissue from ischemia-reperfusion oxidative damage. Hypolipidemic: reduces LDL oxidation and total cholesterol. Mild ACE-inhibiting activity contributes to blood pressure reduction. Water-soluble: extracts well in decoction (traditional method). Alcohol tincture also effective. Traditional Ayurvedic Kshirapaka preparation (decoction in milk) enhances absorption of both arjunolic acid and accompanying triterpenoids. Drying preserves arjunolic acid well. Heat-stable.",
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
    this.parseCompoundReference();
    this.addSupplementaryPlants();
    this.applySubstanceDescriptions();
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
    for (const sub of this.substances.values()) {
      const desc = SUBSTANCE_DESCRIPTIONS[sub.name];
      if (desc) {
        sub.description = desc;
        applied++;
      }
    }
    console.log(`  Substance descs: ${applied}/${this.substances.size}`);
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
        this.synergies.push({ plant_a_id: lowId, plant_b_id: highId, mechanism, effect, tradition });
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
