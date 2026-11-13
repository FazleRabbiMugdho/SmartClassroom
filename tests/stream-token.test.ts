import { describe, it, expect } from "vitest";
import { signStreamToken, verifyStreamToken } from "@/server/vision/stream";

const SECRET = "s3cret";
const NOW = Date.parse("2027-01-01T00:00:00Z");

describe("stream token", () => {
  it("verifies for the same room before it expires", () => {
    const t = signStreamToken("room-1", SECRET, 60, NOW);
    expect(verifyStreamToken(t, "room-1", SECRET, NOW + 30_000)).toBe(true);
  });
  it("expires", () => expect(verifyStreamToken(signStreamToken("room-1", SECRET, 60, NOW), "room-1", SECRET, NOW + 61_000)).toBe(false));
  it("is bound to one room", () => expect(verifyStreamToken(signStreamToken("room-1", SECRET, 60, NOW), "room-2", SECRET, NOW)).toBe(false));
  it("rejects a wrong secret, a tampered payload and garbage", () => {
    const t = signStreamToken("room-1", SECRET, 60, NOW);
    expect(verifyStreamToken(t, "room-1", "other", NOW)).toBe(false);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ room: "room-1", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyStreamToken(`${forged}.${sig}`, "room-1", SECRET, NOW)).toBe(false);
    expect(body).toBeTruthy();
    expect(verifyStreamToken("nope", "room-1", SECRET, NOW)).toBe(false);
  });
});
