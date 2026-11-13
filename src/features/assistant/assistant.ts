// Grounded assistant (Level 6). Deterministic: it maps a question to a FIXED set of intents and
// answers only from the stored daily report. No model writes SQL; there is no free-form query
// path and no cross-room access. Unknown data => a plain "no data" answer, never a guess.

export type Intent =
  | { kind: "temperature"; stat: "max" | "min" | "avg" | "all" }
  | { kind: "humidity"; stat: "max" | "min" | "avg" | "all" }
  | { kind: "alarms"; alarmType: string | null }
  | { kind: "attendance"; status: "PRESENT" | "LATE" | "ABSENT" | "all" };

export interface Parsed { intent: Intent; date: string | null; dateWord: "today" | "yesterday" | "explicit" }
export type Lang = "en" | "bn";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const normalize = (q: string) =>
  q.toLowerCase().replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/\s+/g, " ").trim();

export const detectLang = (q: string): Lang => (/[ঀ-৿]/.test(q) ? "bn" : "en");

export function dhakaDate(nowMs: number, offsetDays = 0): string {
  const d = new Date(nowMs + 6 * 3_600_000 + offsetDays * 86_400_000); // UTC+6, no DST
  return d.toISOString().slice(0, 10);
}

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function parseQuestion(raw: string, nowMs = Date.now()): Parsed | null {
  const q = normalize(raw);
  if (!q) return null;

  let date: string | null = null;
  let dateWord: Parsed["dateWord"] = "today";
  const iso = q.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    dateWord = "explicit";
    if (Number.isNaN(Date.parse(date))) return null;
  } else if (has(q, ["yesterday", "গতকাল"])) {
    date = dhakaDate(nowMs, -1); dateWord = "yesterday";
  } else {
    date = dhakaDate(nowMs);
  }

  const stat = has(q, ["highest", "maximum", "max", "hottest", "peak", "সর্বোচ্চ", "বেশি"]) ? "max"
    : has(q, ["lowest", "minimum", "min ", "coldest", "সর্বনিম্ন", "কম"]) ? "min"
    : has(q, ["average", "avg", "mean", "গড়"]) ? "avg" : "all";

  if (has(q, ["alarm", "alert", "incident", "অ্যালার্ম", "এলার্ম", "সতর্ক", "ঘটনা"])) {
    const alarmType = has(q, ["fire", "আগুন"]) ? "FIRE" : has(q, ["panic", "প্যানিক"]) ? "PANIC"
      : has(q, ["heat danger", "তাপের বিপদ"]) ? "HEAT_DANGER" : null;
    return { intent: { kind: "alarms", alarmType }, date, dateWord };
  }
  if (has(q, ["absent", "অনুপস্থিত"])) return { intent: { kind: "attendance", status: "ABSENT" }, date, dateWord };
  if (has(q, ["late", "দেরি"])) return { intent: { kind: "attendance", status: "LATE" }, date, dateWord };
  if (has(q, ["present", "উপস্থিত"])) return { intent: { kind: "attendance", status: "PRESENT" }, date, dateWord };
  if (has(q, ["attendance", "students", "শিক্ষার্থী"])) return { intent: { kind: "attendance", status: "all" }, date, dateWord };
  if (has(q, ["humidity", "আর্দ্রতা"])) return { intent: { kind: "humidity", stat }, date, dateWord };
  if (has(q, ["temperature", "temp", "heat", "তাপমাত্রা"])) return { intent: { kind: "temperature", stat }, date, dateWord };
  return null;
}

export interface Report {
  date: string; readings: number; has_data: boolean;
  temp_c: { min: number; max: number; avg: number } | null;
  rh: { min: number; max: number; avg: number } | null;
  alarms: Record<string, number>;
  attendance: { present: number; late: number; absent: number };
}
export interface Answer { hasData: boolean; text: string; sources: { label: string; value: string }[] }

const T = {
  en: {
    noData: "No data available",
    max: "highest", min: "lowest", avg: "average",
    temperature: "temperature", humidity: "humidity",
    alarms: (n: number, ty: string | null, d: string) => `${n} ${ty ? ty.replace(/_/g, " ").toLowerCase() + " " : ""}alarm${n === 1 ? "" : "s"} on ${d}.`,
    att: (d: string, p: number, l: number, a: number) => `On ${d}: ${p} present, ${l} late, ${a} absent.`,
    one: (stat: string, what: string, v: number, unit: string, d: string) => `The ${stat} ${what} on ${d} was ${v} ${unit}.`,
    all: (what: string, mn: number, mx: number, av: number, unit: string, d: string) => `${what[0].toUpperCase() + what.slice(1)} on ${d}: min ${mn} ${unit}, max ${mx} ${unit}, average ${av} ${unit}.`,
  },
  bn: {
    noData: "কোনো ডেটা নেই",
    max: "সর্বোচ্চ", min: "সর্বনিম্ন", avg: "গড়",
    temperature: "তাপমাত্রা", humidity: "আর্দ্রতা",
    alarms: (n: number, ty: string | null, d: string) => `${d} তারিখে ${ty ? ty.replace(/_/g, " ") + " " : ""}অ্যালার্ম ${n}টি।`,
    att: (d: string, p: number, l: number, a: number) => `${d} তারিখে: উপস্থিত ${p}, দেরিতে ${l}, অনুপস্থিত ${a}।`,
    one: (stat: string, what: string, v: number, unit: string, d: string) => `${d} তারিখে ${stat} ${what} ছিল ${v} ${unit}।`,
    all: (what: string, mn: number, mx: number, av: number, unit: string, d: string) => `${d} তারিখে ${what}: সর্বনিম্ন ${mn} ${unit}, সর্বোচ্চ ${mx} ${unit}, গড় ${av} ${unit}।`,
  },
} as const;

/** Compose the answer from the report. Values are copied, never recomputed or estimated. */
export function buildAnswer(intent: Intent, r: Report, lang: Lang): Answer {
  const t = T[lang];
  const noData: Answer = { hasData: false, text: t.noData, sources: [] };
  const src = (label: string, value: string) => ({ label, value });

  if (intent.kind === "temperature" || intent.kind === "humidity") {
    const m = intent.kind === "temperature" ? r.temp_c : r.rh;
    if (!r.has_data || !m) return noData;
    const unit = intent.kind === "temperature" ? "°C" : "%";
    const what = t[intent.kind];
    const sources = [src("readings", String(r.readings)), src("date", r.date)];
    if (intent.stat === "all") return { hasData: true, text: t.all(what, m.min, m.max, m.avg, unit, r.date), sources };
    return { hasData: true, text: t.one(t[intent.stat], what, m[intent.stat], unit, r.date), sources };
  }
  if (intent.kind === "alarms") {
    const total = Object.values(r.alarms).reduce((s, n) => s + n, 0);
    if (!r.has_data && total === 0) return noData;
    const n = intent.alarmType ? (r.alarms[intent.alarmType] ?? 0) : total;
    return { hasData: true, text: t.alarms(n, intent.alarmType, r.date), sources: [src("alarms", JSON.stringify(r.alarms)), src("date", r.date)] };
  }
  const { present, late, absent } = r.attendance;
  if (present + late + absent === 0) return noData;
  // The sentence always states all three totals, copied from the report, so any status question is answered by the same numbers.
  return { hasData: true, text: t.att(r.date, present, late, absent), sources: [src("date", r.date)] };
}
