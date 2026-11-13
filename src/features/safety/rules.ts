// Level 3 rules as pure functions. The DEVICE owns the real safety decision; the cloud uses
// these to cross-check what the device reported and to display the rules honestly. A
// disagreement is shown, never masked.

export type Status = "SAFE" | "WARNING" | "DANGER";
export interface Thresholds { warning: number; danger: number }
export interface Reading { t: number; tempC: number; rh: number; quality: "good" | "bad" }

export const DEFAULT_THRESHOLDS: Thresholds = { warning: 32, danger: 40 };
export const HYSTERESIS_C = 2;
export const WARNING_RH_ENTER = 85;
export const WARNING_RH_LEAVE = 80;
export const HOLD_MS = 3000;
export const HEAT_INDEX_FORMULA = "NWS Rothfusz regression, v1";

/** Impossible readings (0-50 °C, 20-90 %RH) are never treated as real (Level 3). */
export function isPlausible(tempC: number, rh: number): boolean {
  return tempC >= 0 && tempC <= 50 && rh >= 20 && rh <= 90;
}

export function isAccepted(r: Pick<Reading, "tempC" | "rh" | "quality">): boolean {
  return r.quality === "good" && isPlausible(r.tempC, r.rh);
}

/** Status the readings call for, given the currently confirmed status (applies hysteresis). */
export function nextStatus(prev: Status, tempC: number, rh: number, th: Thresholds): Status {
  if (tempC >= th.danger) return "DANGER";
  if (prev === "DANGER") {
    if (tempC > th.danger - HYSTERESIS_C) return "DANGER"; // leave at danger-2 or below
    return nextStatus("WARNING", tempC, rh, th);           // then fall into the warning band rules
  }
  if (prev === "WARNING") {
    // Leave only when temp <= warning-2 AND rh <= 80.
    return tempC > th.warning - HYSTERESIS_C || rh > WARNING_RH_LEAVE ? "WARNING" : "SAFE";
  }
  return tempC >= th.warning || rh >= WARNING_RH_ENTER ? "WARNING" : "SAFE";
}

export interface Transition { at: number; from: Status; to: Status }

/**
 * Replay readings in time order. A new status must hold for 3 s before it counts
 * (each confirmed change is a STATUS event). Bad/implausible readings keep the last status.
 */
export function replayStatus(readings: Reading[], th: Thresholds, initial: Status = "SAFE", holdMs = HOLD_MS) {
  let confirmed: Status = initial;
  let pending: { status: Status; since: number } | null = null;
  const transitions: Transition[] = [];
  let rejected = 0;

  for (const r of [...readings].sort((a, b) => a.t - b.t)) {
    if (!isAccepted(r)) { rejected++; continue; }
    const cand = nextStatus(confirmed, r.tempC, r.rh, th);
    if (cand === confirmed) { pending = null; continue; }
    if (!pending || pending.status !== cand) pending = { status: cand, since: r.t };
    if (r.t - pending.since >= holdMs) {
      transitions.push({ at: r.t, from: confirmed, to: cand });
      confirmed = cand;
      pending = null;
    }
  }
  return { status: confirmed, transitions, rejected };
}

/** Heat index in °C from temp (°C) and RH (%). NWS Rothfusz regression with the standard low-range shortcut. */
export function heatIndexC(tempC: number, rh: number): number {
  const T = tempC * 9 / 5 + 32;
  let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + rh * 0.094);
  if (hi >= 80) {
    hi = -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh - 0.00683783 * T * T
      - 0.05481717 * rh * rh + 0.00122874 * T * T * rh + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh;
    if (rh < 13 && T >= 80 && T <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (rh > 85 && T >= 80 && T <= 87) hi += ((rh - 85) / 10) * ((87 - T) / 5);
  }
  return Math.round(((hi - 32) * 5 / 9) * 10) / 10;
}

export type Trend = "RISING" | "STABLE" | "FALLING";

/**
 * Trend from the last 10 accepted temperatures: mean of the newer half vs the older half.
 * Advisory only: it must never operate the door, light or buzzer.
 */
export function trendOf(readings: Reading[]): Trend | null {
  const last = readings.filter(isAccepted).sort((a, b) => a.t - b.t).slice(-10);
  if (last.length < 4) return null;
  const mid = Math.floor(last.length / 2);
  const avg = (xs: Reading[]) => xs.reduce((s, r) => s + r.tempC, 0) / xs.length;
  const diff = avg(last.slice(mid)) - avg(last.slice(0, mid));
  return diff >= 0.5 ? "RISING" : diff <= -0.5 ? "FALLING" : "STABLE";
}
