import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CsiZoneMap, type CsiLive } from "@/components/models/CsiZoneMap";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDhakaTime } from "@/lib/time";

export default async function PresencePage({ params }: { params: Promise<{ roomId: string }> }) {
  await pageRole(STAFF);
  const { roomId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "csi");

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("display_name").eq("id", roomId).maybeSingle();
  if (!room) notFound();
  const [{ data: live }, { data: events }] = await Promise.all([
    supabase.from("room_csi_live").select("*").eq("room_id", roomId).maybeSingle(),
    supabase.from("presence_events").select("state, previous_state, occurred_at").eq("room_id", roomId).order("occurred_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title} · {room.display_name}</h1>
        <Link href={`/rooms/${roomId}/vision`} className="text-sm text-indigo hover:underline">← {L.vision}</Link>
        <Link href="/models/wifi-csi" className="text-sm text-indigo hover:underline">{L.modelLab}</Link>
      </div>
      <p className="text-xs text-muted">{L.cameraNote}</p>
      <CsiZoneMap roomId={roomId} initial={(live as CsiLive | null) ?? null} labels={L} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold">{L.changes}</h2>
        {(events ?? []).length === 0 ? <p className="text-sm text-muted">{L.noChanges}</p> : (
          <ul className="space-y-1 text-sm">
            {(events as { state: string; previous_state: string | null; occurred_at: string }[]).map((e, i) => (
              <li key={i} className="tabular flex items-center gap-2"><span className="text-muted">{formatDhakaTime(e.occurred_at, locale)}</span><Badge tone={e.state === "OCCUPIED" ? "info" : "neutral"}>{e.state}</Badge></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
