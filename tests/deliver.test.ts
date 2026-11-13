import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { sql: string; params: unknown[] }[] = [];
let claimResult: string | null = "delivery-1";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("pending_deliveries")) {
      return [{ notification_id: "n1", kind: "FIRE", title: "FIRE — Room 101", body: "at 10:00", channel: "TELEGRAM", address: "999" }];
    }
    if (sql.includes("begin_delivery")) return [{ id: claimResult }];
    return [];
  }),
}));

import { deliverPending, telegramAdapter, type ChannelAdapter } from "@/features/notifications/deliver";

const adapter = (ok: boolean, error?: string): ChannelAdapter => ({
  channel: "TELEGRAM", provider: "fake",
  send: vi.fn(async () => (ok ? { ok: true, messageId: "m-9" } : { ok: false, error })),
});
const finish = () => calls.find((c) => c.sql.includes("finish_delivery"));

beforeEach(() => { calls.length = 0; claimResult = "delivery-1"; });

describe("deliverPending", () => {
  it("records SENT with the provider message id", async () => {
    const a = adapter(true);
    expect(await deliverPending(a)).toEqual({ sent: 1, failed: 0 });
    expect(finish()?.params).toEqual(["delivery-1", "SENT", "m-9", null]);
    expect(a.send).toHaveBeenCalledWith("999", "FIRE — Room 101\nat 10:00");
  });
  it("records FAILED with the error (so the sweep retries; never silently dropped)", async () => {
    expect(await deliverPending(adapter(false, "timeout"))).toEqual({ sent: 0, failed: 1 });
    expect(finish()?.params).toEqual(["delivery-1", "FAILED", null, "timeout"]);
  });
  it("does not send when another worker already claimed it (no duplicate message)", async () => {
    claimResult = null;
    const a = adapter(true);
    expect(await deliverPending(a)).toEqual({ sent: 0, failed: 0 });
    expect(a.send).not.toHaveBeenCalled();
    expect(finish()).toBeUndefined();
  });
});

describe("telegram adapter", () => {
  it("reports channel_not_configured without a bot token (honest failure)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(await telegramAdapter.send("1", "x")).toEqual({ ok: false, error: "channel_not_configured" });
  });
});
