import { describe, it, expect } from "vitest";
import { LEVEL_REQUIREMENTS } from "@/features/judge/requirements";
import { summarize, isRealEvidence, type ResultRow } from "@/features/judge/queries";

describe("requirement catalog", () => {
  it("covers levels 1-12 with unique, level-prefixed codes", () => {
    expect(Object.keys(LEVEL_REQUIREMENTS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const seen = new Set<string>();
    for (const [lvl, reqs] of Object.entries(LEVEL_REQUIREMENTS)) {
      expect(reqs.length).toBeGreaterThanOrEqual(5);
      for (const r of reqs) {
        expect(r.code.startsWith(`L${lvl}-`), r.code).toBe(true);
        expect(seen.has(r.code), `duplicate ${r.code}`).toBe(false);
        seen.add(r.code);
      }
    }
  });
  it("carries the paper's timing limits", () => {
    const get = (l: number, c: string) => LEVEL_REQUIREMENTS[l].find((r) => r.code === c)!;
    expect(get(1, "L1-WATCHDOG")).toMatchObject({ limit: 10, unit: "s", hardware: true });
    expect(get(3, "L3-FIRE-3S")).toMatchObject({ limit: 3 });
    expect(get(4, "L4-PHONE-10S")).toMatchObject({ limit: 10 });
    expect(get(5, "L5-OTA-3MIN")).toMatchObject({ limit: 180 });
    expect(get(11, "L11-CSI-RATE")).toMatchObject({ limit: 20 });
    expect(get(12, "L12-AP-30S")).toMatchObject({ limit: 30 });
  });
  it("a hardware-only behaviour is never marked software", () => {
    for (const code of ["L1-WATCHDOG", "L3-FIRE-LATCH", "L9-LIVE-2FPS", "L12-BLE"]) {
      const lvl = Number(code.slice(1, code.indexOf("-")));
      expect(LEVEL_REQUIREMENTS[lvl].find((r) => r.code === code)?.hardware, code).toBe(true);
    }
  });
});

const row = (over: Partial<ResultRow>): ResultRow => ({
  id: "x", test_run_id: "r", requirement_code: "c", description: "d", hardware_required: true, measured_value: null, unit: null, limit_value: null,
  outcome: "PENDING", evidence_source: "SOFTWARE_TEST", measured_at: null, notes: null, ...over,
});

describe("evidence summary separates real hardware from simulation", () => {
  it("only real-device passes count as proven hardware", () => {
    const s = summarize([
      row({ outcome: "PASS", evidence_source: "REAL_DEVICE_JUDGE_OBSERVED" }),
      row({ outcome: "PASS", evidence_source: "REAL_DEVICE_SELF_TEST" }),
      row({ outcome: "PENDING", evidence_source: "MOCK_DEVICE" }),
      row({ outcome: "FAIL", evidence_source: "REAL_DEVICE_SELF_TEST" }),
      row({ hardware_required: false, outcome: "PASS", evidence_source: "SOFTWARE_TEST" }),
    ]);
    expect(s).toMatchObject({ hardwareTotal: 4, hardwareProvenReal: 2, hardwareUnproven: 2, softwarePassed: 1, pending: 1, failed: 1 });
  });
  it("classifies evidence sources", () => {
    expect(isRealEvidence("REAL_DEVICE_JUDGE_OBSERVED")).toBe(true);
    expect(isRealEvidence("MOCK_DEVICE")).toBe(false);
    expect(isRealEvidence("SOFTWARE_TEST")).toBe(false);
  });
});
