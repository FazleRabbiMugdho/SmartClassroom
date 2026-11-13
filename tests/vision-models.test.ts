import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { occupiedSeats, pointInPolygon, boxCentre, rectToPolygon, parsePolygon, polygonArea, type Zone } from "@/features/vision/geometry";
import { evaluationInput, validateEvaluation, type EvaluationInput } from "@/features/models/evaluation";
import { csiBatch, cameraAnalysis } from "@/features/device/schemas";

const fx = (n: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url)), "utf8"));

describe("seat-zone geometry (normalized coordinates)", () => {
  const left: Zone = { seat_no: 1, polygon: rectToPolygon(0, 0, 0.5, 1) };
  const right: Zone = { seat_no: 2, polygon: rectToPolygon(0.5, 0, 0.5, 1) };

  it("point-in-polygon, including a concave L shape", () => {
    expect(pointInPolygon([0.25, 0.5], left.polygon)).toBe(true);
    expect(pointInPolygon([0.75, 0.5], left.polygon)).toBe(false);
    const L: [number, number][] = [[0, 0], [0.6, 0], [0.6, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]];
    expect(pointInPolygon([0.1, 0.8], L)).toBe(true);
    expect(pointInPolygon([0.5, 0.8], L)).toBe(false); // in the notch
  });
  it("a zone is occupied by a person's CENTRE, not by box overlap", () => {
    // Box spans both halves but its centre (0.45) is in the left zone.
    expect(occupiedSeats([{ x: 0.3, y: 0.2, w: 0.3, h: 0.4 }], [left, right])).toEqual([1]);
    const [cx, cy] = boxCentre({ x: 0.3, y: 0.2, w: 0.3, h: 0.4 });
    expect(cx).toBeCloseTo(0.45);
    expect(cy).toBeCloseTo(0.4);
  });
  it("sorted unique seats; nobody => none; zones with <3 points are ignored", () => {
    const boxes = [{ x: 0.7, y: 0.1, w: 0.1, h: 0.2 }, { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }, { x: 0.72, y: 0.5, w: 0.1, h: 0.2 }];
    expect(occupiedSeats(boxes, [right, left])).toEqual([1, 2]);
    expect(occupiedSeats([], [left, right])).toEqual([]);
    expect(occupiedSeats(boxes, [{ seat_no: 9, polygon: [[0, 0], [1, 1]] }])).toEqual([]);
  });
  it("layout scales: the same normalized zone works at any resolution", () => {
    // 1920x1080 or 320x240 changes nothing: only normalized numbers are compared.
    expect(occupiedSeats([{ x: 0.2, y: 0.4, w: 0.1, h: 0.2 }], [left])).toEqual([1]);
  });
  it("validates stored polygons and rejects slivers via area", () => {
    expect(parsePolygon([[0, 0], [1, 0], [1, 1]])).not.toBeNull();
    expect(parsePolygon([[0, 0], [2, 0], [1, 1]])).toBeNull(); // outside 0..1
    expect(parsePolygon("nope")).toBeNull();
    expect(polygonArea(rectToPolygon(0, 0, 0.5, 0.5))).toBeCloseTo(0.25);
    expect(polygonArea(rectToPolygon(0, 0, 0.001, 0.5))).toBeLessThan(0.001);
  });
});

describe("model evaluation integrity (no fabricated metrics)", () => {
  const good = (): EvaluationInput => evaluationInput.parse({
    model_kind: "HAND_RAISE", version: "hr-1", features: "pretrained embedding + logistic regression",
    dataset: { version: "ds", raised_count: 120, not_raised_count: 130, held_out_raised: 30, held_out_not_raised: 30 },
    metrics: { held_out_accuracy: 0.9, sample_count: 250, held_out_count: 60, labels: ["RAISED", "NOT_RAISED"], confusion_matrix: [[27, 3], [3, 27]], avg_prediction_ms: 41 },
  });
  it("accepts a consistent evaluation", () => expect(validateEvaluation(good())).toEqual({ ok: true }));
  it("rejects accuracy that does not match the confusion matrix", () => {
    const e = good(); e.metrics.held_out_accuracy = 0.97;
    expect(validateEvaluation(e)).toMatchObject({ ok: false, error: expect.stringMatching(/does not match the confusion matrix/) });
  });
  it("rejects a matrix whose total is not the held-out count, or the wrong shape", () => {
    const a = good(); a.metrics.confusion_matrix = [[27, 3], [3, 28]];
    expect(validateEvaluation(a)).toMatchObject({ ok: false, error: expect.stringMatching(/sums to 61/) });
    const b = good(); b.metrics.confusion_matrix = [[60]];
    expect(validateEvaluation(b)).toMatchObject({ ok: false, error: expect.stringMatching(/2x2/) });
  });
  it("rejects a held-out set under 20% and datasets under 100 per class", () => {
    const a = good(); a.metrics.sample_count = 400; a.dataset = { ...a.dataset!, raised_count: 190, not_raised_count: 210 };
    expect(validateEvaluation(a)).toMatchObject({ ok: false, error: expect.stringMatching(/20%/) });
    const b = good(); b.dataset = { ...b.dataset!, raised_count: 60, not_raised_count: 190 };
    expect(validateEvaluation(b)).toMatchObject({ ok: false, error: expect.stringMatching(/100 raised/) });
  });
  it("a hand-raise evaluation must carry its dataset", () => {
    const e = good(); delete e.dataset;
    expect(validateEvaluation(e)).toMatchObject({ ok: false });
  });
  it("a CSI evaluation needs no image dataset", () => {
    const e = evaluationInput.parse({
      model_kind: "WIFI_CSI_LOCALIZATION", version: "csi-1", features: "mean+std of amplitude per subcarrier, random forest",
      metrics: { held_out_accuracy: 0.84, sample_count: 400, held_out_count: 100, labels: ["EMPTY", "Z1", "Z2", "Z3", "Z4"],
        confusion_matrix: [[18, 1, 0, 1, 0], [2, 16, 1, 1, 0], [0, 2, 16, 2, 0], [1, 0, 2, 16, 1], [0, 1, 1, 0, 18]] },
    });
    expect(validateEvaluation(e)).toEqual({ ok: true });
  });
});

describe("device wire contracts for camera + CSI", () => {
  it("fixtures validate", () => {
    expect(cameraAnalysis.safeParse(fx("camera-analysis.json")).success).toBe(true);
    expect(csiBatch.safeParse(fx("csi-batch.json")).success).toBe(true);
  });
  it("a CSI prediction carrying camera-derived data is a validation error (Level 11 isolation)", () => {
    const bad = fx("csi-batch.json"); bad.prediction = { ...bad.prediction, camera: { persons: 2 } };
    expect(csiBatch.safeParse(bad).success).toBe(false);
    const bad2 = fx("csi-batch.json"); bad2.prediction = { ...bad2.prediction, person_count: 2 };
    expect(csiBatch.safeParse(bad2).success).toBe(false);
  });
  it("rejects an unknown CSI zone label and out-of-range boxes", () => {
    const a = fx("csi-batch.json"); a.samples[0].label = "ZONE_9";
    expect(csiBatch.safeParse(a).success).toBe(false);
    const b = fx("camera-analysis.json"); b.persons[0].x = 1.4;
    expect(cameraAnalysis.safeParse(b).success).toBe(false);
  });
});
