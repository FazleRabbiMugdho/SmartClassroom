import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  telemetryWire, eventWire, offlineBatch, healthReport, faceVerifyRequest,
  csiBatch, cameraAnalysis, commandAck, deviceConfig,
} from "@/features/device/schemas";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8"));

describe("contract fixtures validate against schemas", () => {
  const cases: [string, { safeParse: (v: unknown) => { success: boolean } }][] = [
    ["telemetry.json", telemetryWire],
    ["event-card-tap.json", eventWire],
    ["offline-batch.json", offlineBatch],
    ["health.json", healthReport],
    ["face-verify.json", faceVerifyRequest],
    ["csi-batch.json", csiBatch],
    ["camera-analysis.json", cameraAnalysis],
    ["command-ack.json", commandAck],
    ["config.json", deviceConfig],
  ];

  for (const [file, schema] of cases) {
    it(`${file} validates`, () => {
      expect(schema.safeParse(fx(file)).success).toBe(true);
    });
  }

  it("rejects telemetry missing a required field", () => {
    const bad = fx("telemetry.json");
    delete bad.temp_c;
    expect(telemetryWire.safeParse(bad).success).toBe(false);
  });

  it("accepts status FIRE (paper §6) in telemetry", () => {
    const fire = { ...fx("telemetry.json"), status: "FIRE", flame: true, door: "UNLOCKED" };
    expect(telemetryWire.safeParse(fire).success).toBe(true);
  });

  it("rejects server-only event types from the device endpoint", () => {
    const serverEvt = { ...fx("event-card-tap.json"), type: "FACE_MISMATCH" };
    expect(eventWire.safeParse(serverEvt).success).toBe(false);
  });

  it("preserves unknown firmware fields (passthrough, not dropped)", () => {
    const withExtra = { ...fx("telemetry.json"), vendor_debug: "x1" };
    const parsed = telemetryWire.parse(withExtra) as Record<string, unknown>;
    expect(parsed.vendor_debug).toBe("x1");
  });
});
