// Level 2 database (SQLite via node:sqlite). Later levels add tables; they never change these.
import { DatabaseSync } from "node:sqlite";

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;

    -- One row per accepted message, from telemetry and events together.
    -- (device_id, seq) is the primary key, so a message sent twice is never stored twice.
    CREATE TABLE IF NOT EXISTS seqs (
      device_id TEXT NOT NULL,
      seq       INTEGER NOT NULL,
      kind      TEXT NOT NULL,
      PRIMARY KEY (device_id, seq)
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      device_id TEXT NOT NULL, seq INTEGER NOT NULL, room_id TEXT, ts INTEGER NOT NULL,
      uptime_s INTEGER, temp_c REAL, rh REAL, heat_index_c REAL, flame INTEGER, door TEXT,
      status TEXT, heat_trend TEXT, rssi INTEGER, heap_kb INTEGER, chip_temp_c REAL, fw TEXT,
      quality TEXT, received_at INTEGER NOT NULL,
      PRIMARY KEY (device_id, seq)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, seq INTEGER, room_id TEXT, ts INTEGER NOT NULL,
      type TEXT NOT NULL, detail TEXT, source TEXT NOT NULL DEFAULT 'device', received_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS events_device_seq ON events(device_id, seq) WHERE seq IS NOT NULL;

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY, room_id TEXT, last_seen INTEGER, online INTEGER NOT NULL DEFAULT 0, fw TEXT
    );

    -- Level 3: commands for a device (Reset fire). The device fetches them; each is delivered once.
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, type TEXT NOT NULL, issued_by TEXT, created_at INTEGER NOT NULL, delivered_at INTEGER
    );
  `);
  return db;
}
