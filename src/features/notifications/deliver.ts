import { query } from "@/lib/db";

// Phone delivery (Level 4: FIRE/PANIC/Heat Danger within 10 s). One real channel: Telegram.
// Every attempt is recorded with provider result and time (notification_deliveries). A
// notification already SENT is never sent again; a failed one is retried (<5 attempts) by the
// periodic sweep. Not configured => attempt recorded as FAILED, never silently skipped.

export interface Outcome { ok: boolean; messageId?: string; error?: string }
export interface ChannelAdapter {
  channel: "TELEGRAM";
  provider: string;
  send(address: string, text: string): Promise<Outcome>;
}

export const telegramAdapter: ChannelAdapter = {
  channel: "TELEGRAM",
  provider: "telegram-bot-api",
  async send(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, error: "channel_not_configured" };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (res.ok && body.ok) return { ok: true, messageId: String(body.result?.message_id ?? "") };
      return { ok: false, error: body.description ?? `http_${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network_error" };
    }
  },
};

interface Pending { notification_id: string; kind: string; title: string; body: string; channel: string; address: string }

/** Deliver whatever is pending. Safe to call concurrently: begin_delivery arbitrates. */
export async function deliverPending(adapter: ChannelAdapter = telegramAdapter, limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = await query<Pending>("select * from public.pending_deliveries($1)", [limit]);
  let sent = 0, failed = 0;
  for (const row of rows.filter((r) => r.channel === adapter.channel)) {
    const claim = await query<{ id: string | null }>("select public.begin_delivery($1, $2, $3) as id", [row.notification_id, row.channel, adapter.provider]);
    const deliveryId = claim[0]?.id;
    if (!deliveryId) continue; // already delivered or another worker is on it
    const out = await adapter.send(row.address, `${row.title}\n${row.body}`);
    await query("select public.finish_delivery($1, $2, $3, $4)", [deliveryId, out.ok ? "SENT" : "FAILED", out.messageId ?? null, out.error ?? null]);
    if (out.ok) sent++; else failed++;
  }
  return { sent, failed };
}
