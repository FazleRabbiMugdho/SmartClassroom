import { createHash } from "node:crypto";

/** Hash a device token for storage/verification. Never store the raw token. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
