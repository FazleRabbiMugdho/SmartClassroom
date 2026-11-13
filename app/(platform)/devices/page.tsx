import { cookies } from "next/headers";
import Link from "next/link";
import { Cpu } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveConnState } from "@/features/rooms/derive";
import { ConnectionPill } from "@/components/shared/ConnectionPill";
import { Table } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDhakaDateTime } from "@/lib/time";

type Row = { id: string; device_code: string; firmware_version: string | null; last_seen_at: string | null; room: { display_name: string } | null };

export default async function DevicesPage() {
  const ctx = await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "dev");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("devices").select("id, device_code, firmware_version, last_seen_at, room:rooms(display_name)").order("device_code");
  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      {rows.length === 0 ? <EmptyState icon={Cpu} title={L.none} /> : (
        <Table rows={rows} rowKey={(r) => r.id} columns={[
          { key: "c", header: L.code, mono: true, render: (r) => <Link href={`/devices/${r.id}`} className="text-indigo hover:underline">{r.device_code}</Link> },
          { key: "r", header: L.room, render: (r) => r.room?.display_name ?? "—" },
          { key: "f", header: L.firmware, mono: true, render: (r) => r.firmware_version ?? "—" },
          { key: "s", header: L.lastSeen, render: (r) => <span className="inline-flex items-center gap-2"><ConnectionPill state={deriveConnState(r.last_seen_at, now)} /><span className="tabular text-xs text-muted">{formatDhakaDateTime(r.last_seen_at, locale)}</span></span> },
          ...(ctx.role === "ADMIN" ? [{ key: "a", header: "", render: (r: Row) => <span className="flex gap-3 text-sm"><Link className="text-indigo hover:underline" href={`/devices/${r.id}/configuration`}>{L.configuration}</Link><Link className="text-indigo hover:underline" href={`/devices/${r.id}/ota`}>{L.ota}</Link></span> }] : []),
        ]} />
      )}
    </div>
  );
}
