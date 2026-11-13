// Event-history filters. ONE function turns query params into a filter plan; the history page
// and the CSV export both apply that same plan, so the CSV always equals what the page shows.

export const EVENT_TYPES = [
  "BOOT", "STATUS", "FIRE", "FIRE_CLEARED", "SILENCED", "PANIC", "CARD_TAP", "ENTRY_GRANTED", "ENTRY_DENIED",
  "NO_FACE", "OFFLINE_ENTRY", "SENSOR_ERROR", "SETTINGS_APPLIED", "OTA_DONE", "OTA_REJECTED", "OTA_ROLLBACK",
  "UNKNOWN_CARD", "FACE_MISMATCH", "SPOOF", "CARD_BLOCKED", "STUDENT_DELETED", "WEATHER_ALERT", "OCCUPANCY",
  "OVER_CAPACITY", "INTRUDER", "CAMERA_FAULT", "CAMERA_OK", "HAND_RAISED", "PRESENCE", "ACK",
] as const;

export interface EventFilters { roomId: string; type: string | null; fromIso: string | null; toIso: string | null; page: number }
export type PlanOp = ["eq" | "gte" | "lt", string, string];

export const PAGE_SIZE = 50;
export const EXPORT_LIMIT = 50_000;

/** datetime-local ("2026-12-10T14:30") is entered in Asia/Dhaka (UTC+6, no DST). */
export function dhakaLocalToIso(local: string | null | undefined): string | null {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseEventFilters(roomId: string, sp: Record<string, string | undefined>): EventFilters {
  const type = sp.type && (EVENT_TYPES as readonly string[]).includes(sp.type) ? sp.type : null;
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  return { roomId, type, fromIso: dhakaLocalToIso(sp.from), toIso: dhakaLocalToIso(sp.to), page };
}

/** `to` is inclusive of the chosen minute, so the upper bound is exclusive at +1 minute. */
export function eventFilterPlan(f: EventFilters): PlanOp[] {
  const plan: PlanOp[] = [["eq", "room_id", f.roomId]];
  if (f.type) plan.push(["eq", "event_type", f.type]);
  if (f.fromIso) plan.push(["gte", "received_at", f.fromIso]);
  if (f.toIso) plan.push(["lt", "received_at", new Date(Date.parse(f.toIso) + 60_000).toISOString()]);
  return plan;
}

export function applyPlan<B extends object>(builder: B, plan: PlanOp[]): B {
  let b = builder as unknown as Record<string, (c: string, v: string) => unknown>;
  for (const [op, col, val] of plan) b = b[op](col, val) as typeof b;
  return b as unknown as B;
}

export type Severity = "CRITICAL" | "WARNING" | "INFO" | "OK";
const CRITICAL = new Set(["FIRE", "PANIC", "INTRUDER", "SPOOF", "CAMERA_FAULT", "OTA_ROLLBACK", "SENSOR_ERROR"]);
const WARNING = new Set(["ENTRY_DENIED", "NO_FACE", "FACE_MISMATCH", "CARD_BLOCKED", "OVER_CAPACITY", "OTA_REJECTED", "UNKNOWN_CARD", "WEATHER_ALERT", "OFFLINE_ENTRY"]);
const OK = new Set(["ENTRY_GRANTED", "FIRE_CLEARED", "CAMERA_OK", "OTA_DONE", "SETTINGS_APPLIED", "SILENCED"]);
export const eventSeverity = (type: string): Severity => (CRITICAL.has(type) ? "CRITICAL" : WARNING.has(type) ? "WARNING" : OK.has(type) ? "OK" : "INFO");
