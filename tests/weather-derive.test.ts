import { describe, it, expect } from "vitest";
import { deriveNotices, type HourPoint } from "@/features/weather/derive";

const base = Date.parse("2026-12-10T00:00:00Z");
const hours = (f: (i: number) => Partial<HourPoint>): HourPoint[] =>
  Array.from({ length: 24 }, (_, i) => ({
    time: new Date(base + i * 3_600_000).toISOString(),
    temp_c: 28, apparent_c: 30, precip_mm: 0, gust_kmh: 15, ...f(i),
  }));

describe("deriveNotices", () => {
  it("returns nothing for calm weather (no invented warnings)", () => {
    expect(deriveNotices(hours(() => ({})))).toEqual([]);
    expect(deriveNotices([])).toEqual([]);
  });
  it("heatwave severity follows feels-like bands and is labelled derived", () => {
    const adv = deriveNotices(hours((i) => (i === 6 ? { apparent_c: 35 } : {})));
    expect(adv[0]).toMatchObject({ category: "HEATWAVE", severity: "ADVISORY" });
    const warn = deriveNotices(hours((i) => (i === 6 ? { apparent_c: 38.4 } : {})));
    expect(warn[0].severity).toBe("WARNING");
    const dng = deriveNotices(hours((i) => (i >= 6 && i <= 8 ? { apparent_c: 42 } : {})));
    expect(dng[0].severity).toBe("DANGER");
    expect(dng[0].text).toMatch(/not an official alert/);
  });
  it("the window covers the hours at the chosen severity plus the closing hour", () => {
    const n = deriveNotices(hours((i) => (i >= 6 && i <= 8 ? { apparent_c: 42 } : {})))[0];
    expect(Date.parse(n.window_start)).toBe(base + 6 * 3_600_000);
    expect(Date.parse(n.window_end)).toBe(base + 9 * 3_600_000);
  });
  it("storm winds use gust bands", () => {
    expect(deriveNotices(hours((i) => (i === 3 ? { gust_kmh: 62 } : {})))[0]).toMatchObject({ category: "STORM", severity: "WARNING" });
    expect(deriveNotices(hours((i) => (i === 3 ? { gust_kmh: 90 } : {})))[0].severity).toBe("DANGER");
    expect(deriveNotices(hours((i) => (i === 3 ? { gust_kmh: 49 } : {})))).toEqual([]);
  });
  it("heavy rain uses the 24 h total", () => {
    const rain = deriveNotices(hours((i) => (i >= 2 && i < 12 ? { precip_mm: 7 } : {})))[0]; // 70 mm
    expect(rain).toMatchObject({ category: "HEAVY_RAIN_FLOOD", severity: "WARNING" });
    expect(deriveNotices(hours((i) => (i === 2 ? { precip_mm: 20 } : {})))).toEqual([]); // 20 mm: below advisory
  });
  it("never derives a cyclone (only official/test notices can be cyclones)", () => {
    const all = deriveNotices(hours(() => ({ apparent_c: 45, gust_kmh: 120, precip_mm: 10 })));
    expect(all.some((n) => (n.category as string) === "CYCLONE")).toBe(false);
  });
});
