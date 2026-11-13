import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, ShieldAlert, History, ScanEye, Wifi, RefreshCcw } from "lucide-react";
import { labelsFor, resolveLocale, t } from "@/i18n/dictionaries";
import { getRoomSnapshot, listRooms } from "@/features/rooms/queries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { RoomDashboard } from "@/components/rooms/RoomDashboard";
import { RoomSelector } from "@/components/rooms/RoomSelector";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await pageRole(STAFF);
  const { roomId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);

  const [snap, rooms] = await Promise.all([getRoomSnapshot(roomId), listRooms()]);
  if (!snap.room) notFound(); // out-of-scope and missing look identical

  const labels = labelsFor(locale, "room");
  const simulated =
    process.env.NODE_ENV !== "production" && !!process.env.DEV_DEVICE_ID && snap.device?.device_code === process.env.DEV_DEVICE_ID;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{snap.room.display_name}</h1>
        <span className="tabular text-sm text-muted">{snap.room.room_code}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <RoomSelector rooms={rooms} value={roomId} label={labels.select} />
          {[
            [`/rooms/${roomId}/attendance`, CalendarCheck, labels.attendance],
            [`/rooms/${roomId}/safety`, ShieldAlert, t(locale, "nav.safety")],
            [`/rooms/${roomId}/history`, History, t(locale, "hist.title")],
            [`/rooms/${roomId}/vision`, ScanEye, t(locale, "nav.vision")],
            [`/rooms/${roomId}/presence`, Wifi, t(locale, "csi.title")],
            [`/rooms/${roomId}/recovery`, RefreshCcw, t(locale, "rec.title")],
          ].map(([href, Icon, label]) => {
            const I = Icon as typeof CalendarCheck;
            return (
              <Link key={String(href)} href={String(href)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted hover:text-ink">
                <I className="size-4" aria-hidden />
                {String(label)}
              </Link>
            );
          })}
        </div>
      </div>
      <RoomDashboard initial={snap} role={ctx.role} labels={labels} locale={locale} simulated={simulated} />
    </div>
  );
}
