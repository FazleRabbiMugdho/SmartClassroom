import { createHmac, timingSafeEqual } from "node:crypto";

// Live view needs a persistent stream (>= 2 FPS), which cannot run in a short-lived serverless
// route. The stream is served by a separate worker; this module only mints/verifies a short-lived
// signed token so that worker can authenticate a browser WITHOUT sharing a session or a public URL.
// Worker contract: GET {STREAM_WORKER_URL}/stream/{roomId}?token=<token>; verify with the same secret.

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signStreamToken(roomId: string, secret: string, ttlSeconds = 60, nowMs = Date.now()): string {
  const body = b64(JSON.stringify({ room: roomId, exp: Math.floor(nowMs / 1000) + ttlSeconds }));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

export function verifyStreamToken(token: string, roomId: string, secret: string, nowMs = Date.now()): boolean {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expect = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expect.length || !timingSafeEqual(given, expect)) return false;
  try {
    const { room, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { room: string; exp: number };
    return room === roomId && exp * 1000 > nowMs;
  } catch {
    return false;
  }
}
