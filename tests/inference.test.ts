import { describe, it, expect, afterEach } from "vitest";
import { embedFaces, matchFace, InferenceUnavailable } from "@/server/inference/face";

const env = process.env as Record<string, string | undefined>;
afterEach(() => {
  delete env.INFERENCE_URL;
  delete env.MOCK_INFERENCE;
  env.NODE_ENV = "test";
});

describe("face inference adapter never fabricates", () => {
  it("throws when unconfigured (caller must deny/pend, not grant)", async () => {
    await expect(matchFace("abc", ["e"])).rejects.toBeInstanceOf(InferenceUnavailable);
    await expect(embedFaces(["a", "b", "c"])).rejects.toBeInstanceOf(InferenceUnavailable);
  });
  it("requires at least 3 images to enrol", async () => {
    await expect(embedFaces(["a", "b"])).rejects.toThrow(/at least 3/);
  });
  it("mock mode is dev-only, labelled synthetic", async () => {
    env.MOCK_INFERENCE = "1";
    const r = await matchFace("abc", ["e"]);
    expect(r).toEqual({ result: "MATCH", synthetic: true });
  });
  it("mock mode is ignored in production", async () => {
    env.MOCK_INFERENCE = "1";
    env.NODE_ENV = "production";
    await expect(matchFace("abc", ["e"])).rejects.toBeInstanceOf(InferenceUnavailable);
  });
});
