import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyPlan, eventFilterPlan, eventSeverity, parseEventFilters, EVENT_TYPES, PAGE_SIZE } from "@/features/history/filters";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { Table } from "@/components/ui/Table";
import { formatDhakaDateTime, formatDhakaTime } from "@/lib/time";

type Row = { id: string; event_type: string; source: string; device_ts: string | null; received_at: string; is_offline_sync: boolean; detail: Record<string, unknown>; device: { device_code: string } | null };
const tone = { CRITICAL: "danger", WARNING: "warning", OK: "safe", INFO: "info" } as const;

// Teacher/Admin only (RLS also limits Teachers to their own rooms). Filtering happens in the
// database: the browser never downloads the whole event table.
export default async function HistoryPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await pageRole(STAFF);
  const { roomId } = await params;
  const sp = await searchParams;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "hist");

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("id, display_name").eq("id", roomId).maybeSingle();
  if (!room) notFound();

  const f = parseEventFilters(roomId, sp);
  const from = (f.page - 1) * PAGE_SIZE;
  const { data } = await applyPlan(
    supabase.from("device_events")
      .select("id, event_type, source, device_ts, received_at, is_offline_sync, detail, device:devices(device_code)")
      .order("received_at", { ascending: false }).range(from, from + PAGE_SIZE), // one extra row => "next" exists
    eventFilterPlan(f),
  );
  const all = (data ?? []) as unknown as Row[];
  const rows = all.slice(0, PAGE_SIZE);
  const hasNext = all.length > PAGE_SIZE;

  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), ...extra }).toString();
  const exportQs = new URLSearchParams({ room: roomId, ...(sp.type ? { type: sp.type } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title} · {room.display_name}</h1>
        <Link href={`/rooms/${roomId}`} className="text-sm text-indigo hover:underline">← {room.display_name}</Link>
      </div>

      <Card>
        <form className="grid items-end gap-3 sm:grid-cols-4" method="get">
          <Field label={L.type} htmlFor="type">
            <Select id="type" name="type" defaultValue={sp.type ?? ""}>
              <option value="">{L.all}</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label={L.from} htmlFor="from"><Input id="from" name="from" type="datetime-local" defaultValue={sp.from ?? ""} /></Field>
          <Field label={L.to} htmlFor="to"><Input id="to" name="to" type="datetime-local" defaultValue={sp.to ?? ""} /></Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm">{L.apply}</Button>
            <a href={`/api/export/events?${exportQs}`} className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-ink hover:bg-canvas">{L.export}</a>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">{L.none}</p> : (
        <Table rows={rows} rowKey={(r) => r.id} columns={[
          { key: "t", header: "Time", mono: true, render: (r) => formatDhakaDateTime(r.device_ts ?? r.received_at, locale) },
          { key: "rx", header: L.received, mono: true, render: (r) => formatDhakaTime(r.received_at, locale) },
          { key: "ty", header: L.type, render: (r) => <span className="inline-flex items-center gap-2"><Badge tone={tone[eventSeverity(r.event_type)]}>{r.event_type}</Badge>{r.is_offline_sync && <Badge tone="warning">{L.offlineSync}</Badge>}</span> },
          { key: "dv", header: L.device, mono: true, render: (r) => r.device?.device_code ?? "server" },
          { key: "d", header: L.detail, render: (r) => <span className="tabular block max-w-[28ch] truncate text-xs text-muted">{Object.keys(r.detail ?? {}).length ? JSON.stringify(r.detail) : "—"}</span> },
        ]} />
      )}

      <div className="flex items-center justify-between text-sm">
        {f.page > 1 ? <Link className="text-indigo hover:underline" href={`?${qs({ page: String(f.page - 1) })}`}>← {L.prev}</Link> : <span />}
        <span className="text-muted">{L.page} {f.page}</span>
        {hasNext ? <Link className="text-indigo hover:underline" href={`?${qs({ page: String(f.page + 1) })}`}>{L.next} →</Link> : <span />}
      </div>
    </div>
  );
}
