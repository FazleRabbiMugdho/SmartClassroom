import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVision } from "@/features/vision/load";
import { VisionConsole } from "@/components/vision/VisionConsole";
import { SeatMapEditor, toEditorZones } from "@/components/vision/SeatMapEditor";
import { ReferenceUploader } from "@/components/vision/ReferenceUploader";
import { Card } from "@/components/ui/Card";

// Teacher/Admin only (RLS scopes Teachers to their own rooms; Students/Guardians never reach this page).
export default async function VisionPage({ params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await pageRole(STAFF);
  const { roomId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "vis");

  const supabase = await createSupabaseServerClient();
  const data = await loadVision(supabase, roomId);
  if (!data) notFound();
  const { data: room } = await supabase.from("rooms").select("display_name").eq("id", roomId).maybeSingle();
  const isAdmin = ctx.role === "ADMIN";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title} · {room?.display_name}</h1>
        <Link href={`/rooms/${roomId}`} className="text-sm text-indigo hover:underline">← {room?.display_name}</Link>
        <Link href={`/rooms/${roomId}/presence`} className="text-sm text-indigo hover:underline">{L.csiLink}</Link>
      </div>

      <VisionConsole roomId={roomId} initial={data} role={ctx.role === "ADMIN" ? "ADMIN" : "TEACHER"} labels={L} locale={locale} />

      {isAdmin && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">{L.references}</h2>
            <p className="text-xs text-muted">{L.referencesNote}</p>
            <ReferenceUploader roomId={roomId} labels={L} />
          </Card>
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">{L.zoneEditor}</h2>
            <SeatMapEditor roomId={roomId} imageUrl={data.hasReference.ROOM ? `/api/rooms/${roomId}/reference/ROOM` : null} initial={toEditorZones(data.zones)} labels={L} />
          </Card>
        </div>
      )}
    </div>
  );
}
