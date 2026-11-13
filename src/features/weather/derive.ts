// Forecast-derived weather notices (Level 6). These are NOT official alerts and are labelled
// FORECAST_DERIVED everywhere. Thresholds are project-chosen (documented below), loosely based
// on common meteorological bands; a cyclone cannot be derived from an hourly forecast, so it is
// only ever an OFFICIAL/TEST notice.

export interface HourPoint { time: string; temp_c: number; apparent_c: number; precip_mm: number; gust_kmh: number }
export type Severity = "ADVISORY" | "WARNING" | "DANGER";
export type Category = "STORM" | "HEAVY_RAIN_FLOOD" | "HEATWAVE";
export interface DerivedNotice { category: Category; severity: Severity; window_start: string; window_end: string; text: string }

export const BANDS = {
  HEATWAVE: { metric: "apparent temperature (°C)", advisory: 35, warning: 38, danger: 41 },
  STORM: { metric: "wind gusts (km/h)", advisory: 50, warning: 62, danger: 89 },
  HEAVY_RAIN_FLOOD: { metric: "24 h rainfall (mm)", advisory: 35, warning: 64.5, danger: 120 },
} as const;

const HOUR = 3_600_000;
const sev = (v: number, b: { advisory: number; warning: number; danger: number }): Severity | null =>
  v >= b.danger ? "DANGER" : v >= b.warning ? "WARNING" : v >= b.advisory ? "ADVISORY" : null;
const level = { ADVISORY: "advisory", WARNING: "warning", DANGER: "danger" } as const;

const dhakaHour = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date(iso));

function peakNotice(category: "HEATWAVE" | "STORM", pts: HourPoint[], pick: (p: HourPoint) => number, label: string, unit: string): DerivedNotice | null {
  const b = BANDS[category];
  const peak = Math.max(...pts.map(pick));
  const severity = sev(peak, b);
  if (!severity) return null;
  const threshold = b[level[severity]];
  const hit = pts.filter((p) => pick(p) >= threshold);
  const start = hit[0].time;
  const end = new Date(Date.parse(hit[hit.length - 1].time) + HOUR).toISOString();
  return {
    category, severity, window_start: start, window_end: end,
    text: `${label} ${level[severity]}: up to ${peak.toFixed(1)} ${unit} between ${dhakaHour(start)} and ${dhakaHour(end)} (Asia/Dhaka). Derived from the forecast, not an official alert.`,
  };
}

export function deriveNotices(hourly: HourPoint[]): DerivedNotice[] {
  if (hourly.length === 0) return [];
  const out: DerivedNotice[] = [];
  const heat = peakNotice("HEATWAVE", hourly, (p) => p.apparent_c, "Heatwave", "°C feels-like");
  if (heat) out.push(heat);
  const storm = peakNotice("STORM", hourly, (p) => p.gust_kmh, "Storm winds", "km/h gusts");
  if (storm) out.push(storm);

  const total = hourly.reduce((s, p) => s + p.precip_mm, 0);
  const rainSev = sev(total, BANDS.HEAVY_RAIN_FLOOD);
  if (rainSev) {
    const wet = hourly.filter((p) => p.precip_mm > 0);
    const start = wet[0].time;
    const end = new Date(Date.parse(wet[wet.length - 1].time) + HOUR).toISOString();
    out.push({
      category: "HEAVY_RAIN_FLOOD", severity: rainSev, window_start: start, window_end: end,
      text: `Heavy rain ${level[rainSev]}: about ${total.toFixed(0)} mm expected over 24 hours (Asia/Dhaka ${dhakaHour(start)}–${dhakaHour(end)}). Derived from the forecast, not an official alert.`,
    });
  }
  return out;
}
