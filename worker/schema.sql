-- PlantMe Database Schema (Cloudflare D1 / SQLite)
-- Tracks medicinal plants, conditions, traditions, preparations, substances, cautions, and synergies.

-- ── Core entities ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plants (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    scientific  TEXT,
    alt_names   TEXT,            -- JSON array
    description TEXT,
    historical  TEXT,
    part_used   TEXT,
    image_url   TEXT
);

CREATE TABLE IF NOT EXISTS conditions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    system_id   INTEGER NOT NULL REFERENCES body_systems(id)
);

CREATE TABLE IF NOT EXISTS body_systems (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    section_num INTEGER NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS traditions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS preparations (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    instructions TEXT,
    equipment   TEXT
);

CREATE TABLE IF NOT EXISTS substances (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS cautions (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    severity    TEXT CHECK(severity IN ('info', 'warning', 'danger')),
    detail      TEXT
);

-- ── Relationships (edges) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plant_conditions (
    plant_id    INTEGER NOT NULL REFERENCES plants(id),
    condition_id INTEGER NOT NULL REFERENCES conditions(id),
    dosage      TEXT,
    notes       TEXT,
    PRIMARY KEY (plant_id, condition_id)
);

CREATE TABLE IF NOT EXISTS plant_traditions (
    plant_id    INTEGER NOT NULL REFERENCES plants(id),
    tradition_id INTEGER NOT NULL REFERENCES traditions(id),
    historical_note TEXT,
    PRIMARY KEY (plant_id, tradition_id)
);

CREATE TABLE IF NOT EXISTS plant_preparations (
    plant_id    INTEGER NOT NULL REFERENCES plants(id),
    preparation_id INTEGER NOT NULL REFERENCES preparations(id),
    instructions TEXT,
    PRIMARY KEY (plant_id, preparation_id)
);

CREATE TABLE IF NOT EXISTS plant_substances (
    plant_id    INTEGER NOT NULL REFERENCES plants(id),
    substance_id INTEGER NOT NULL REFERENCES substances(id),
    part_used   TEXT,
    PRIMARY KEY (plant_id, substance_id)
);

CREATE TABLE IF NOT EXISTS plant_cautions (
    plant_id    INTEGER NOT NULL REFERENCES plants(id),
    caution_id  INTEGER NOT NULL REFERENCES cautions(id),
    detail      TEXT,
    PRIMARY KEY (plant_id, caution_id)
);

CREATE TABLE IF NOT EXISTS synergies (
    plant_a_id  INTEGER NOT NULL REFERENCES plants(id),
    plant_b_id  INTEGER NOT NULL REFERENCES plants(id),
    mechanism   TEXT,
    effect      TEXT,
    tradition   TEXT,
    CHECK (plant_a_id < plant_b_id),
    PRIMARY KEY (plant_a_id, plant_b_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_plants_slug ON plants(slug);
CREATE INDEX IF NOT EXISTS idx_conditions_slug ON conditions(slug);
CREATE INDEX IF NOT EXISTS idx_conditions_system ON conditions(system_id);
CREATE INDEX IF NOT EXISTS idx_body_systems_slug ON body_systems(slug);
CREATE INDEX IF NOT EXISTS idx_traditions_slug ON traditions(slug);
CREATE INDEX IF NOT EXISTS idx_preparations_slug ON preparations(slug);
CREATE INDEX IF NOT EXISTS idx_substances_slug ON substances(slug);
CREATE INDEX IF NOT EXISTS idx_cautions_slug ON cautions(slug);

CREATE INDEX IF NOT EXISTS idx_plant_conditions_plant ON plant_conditions(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_conditions_condition ON plant_conditions(condition_id);
CREATE INDEX IF NOT EXISTS idx_plant_traditions_plant ON plant_traditions(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_traditions_tradition ON plant_traditions(tradition_id);
CREATE INDEX IF NOT EXISTS idx_plant_preparations_plant ON plant_preparations(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_substances_plant ON plant_substances(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_cautions_plant ON plant_cautions(plant_id);
CREATE INDEX IF NOT EXISTS idx_synergies_a ON synergies(plant_a_id);
CREATE INDEX IF NOT EXISTS idx_synergies_b ON synergies(plant_b_id);

-- ── Full-text search ─────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    entity_type,   -- 'plant', 'condition', 'substance', 'tradition'
    entity_slug,
    name,
    alt_names,
    description,
    content
);
