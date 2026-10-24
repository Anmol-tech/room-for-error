import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { ASSETS_DIR, DB_PATH } from "./config.ts";

mkdirSync(ASSETS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS adventures (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    current_version INTEGER,
    prepared INTEGER NOT NULL DEFAULT 0,
    validator_issues TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id, version)
  );

  -- kind: 'player' sessions belong to people; 'preview' sessions are for automated test runs
  -- and must never share rows with player sessions.
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    message TEXT,
    message_kind TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Keyed by prompt hash, not scenario version, so repairs that don't touch a scene reuse its image.
  CREATE TABLE IF NOT EXISTS images (
    scenario_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    scene_state_id TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    path TEXT,
    error TEXT,
    PRIMARY KEY (scenario_id, room_id, scene_state_id, prompt_hash)
  );
`);

// Added after the first schema: clickable areas found in each image (JSON array of Hotspot).
const imageCols = db.prepare("PRAGMA table_info(images)").all() as { name: string }[];
if (!imageCols.some((c) => c.name === "hotspots")) db.exec("ALTER TABLE images ADD COLUMN hotspots TEXT");
// Which set of room actions the stored hotspots were detected for.
if (!imageCols.some((c) => c.name === "hotspots_sig")) db.exec("ALTER TABLE images ADD COLUMN hotspots_sig TEXT");

// Inventory item pictures, keyed by prompt hash like scene images.
db.exec(`
  CREATE TABLE IF NOT EXISTS item_icons (
    scenario_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    path TEXT,
    error TEXT,
    PRIMARY KEY (scenario_id, item_id, prompt_hash)
  );
`);

// Session progress that must survive a refresh, and generation stages for the arrival screen.
const sessionCols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
for (const [name, type] of [
  ["moves", "INTEGER NOT NULL DEFAULT 0"],
  ["hints_used", "INTEGER NOT NULL DEFAULT 0"],
  ["hint_step", "TEXT"],
  ["hint_level", "INTEGER NOT NULL DEFAULT 0"],
  ["log", "TEXT NOT NULL DEFAULT '[]'"],
  ["found", "TEXT NOT NULL DEFAULT '[]'"],
  ["started_at", "TEXT"],
  ["ended_at", "TEXT"],
] as const) {
  if (!sessionCols.some((c) => c.name === name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
}
const adventureCols = db.prepare("PRAGMA table_info(adventures)").all() as { name: string }[];
if (!adventureCols.some((c) => c.name === "stages")) db.exec("ALTER TABLE adventures ADD COLUMN stages TEXT");
