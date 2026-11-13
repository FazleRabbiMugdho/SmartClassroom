import { cookies } from "next/headers";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listRooms } from "@/features/rooms/queries";
import { dhakaDate, type Report } from "@/features/assistant/assistant";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ room?: string; date?: string }> }) {
  await pageRole(STAFF);
  const sp = await searchParams;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "rep");
  const R = labelsFor(locale, "room");

  const rooms = await listRooms();
  const room = rooms.find((r) => r.id === sp.room) ?? rooms[0];
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : dhakaDate(Date.now());

  let r: Report | null = null;
  if (room) {
    // SQL function runs as the caller (RLS): a Teacher only ever sees their own rooms.
    const supabase = await createSupabaseServerClient();
    r = ((await supabase.rpc("daily_report", { p_room: room.id, p_date: date })).data as Report | null) ?? null;
  }
  const stat = (label: string, m: { min: number; max: number; avg: number } | null, unit: string) => (
    <Card>
      <p className="text-[13px] text-muted">{label}</p>
      {m ? (
        <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
          {[[L.min, m.min], [L.avg, m.avg], [L.max, m.max]].map(([k, v]) => (<div key={String(k)}><dt className="text-xs text-muted">{k}</dt><dd className="text-xl font-semibold">{v}{unit}</dd></div>))}
        </dl>
      ) : <p className="mt-2 text-sm text-muted">{L.noData}</p>}
    </Card>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      <Card>
        <form method="get" className="grid items-end gap-3 sm:grid-cols-4">
          <Field label={R.select} htmlFor="room"><Select id="room" name="room" defaultValue={room?.id}>{rooms.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}</Select></Field>
          <Field label={L.date} htmlFor="date"><Input id="date" name="date" type="date" defaultValue={date} /></Field>
          <Button type="submit" size="sm">{L.show}</Button>
          {room && <a href={`/api/export/report?room=${room.id}&date=${date}`} className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-canvas">{L.csv}</a>}
        </form>
        <p className="mt-2 text-xs text-muted">{L.timezone}</p>
      </Card>

      {r && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {stat("°C", r.has_data ? r.temp_c : null, "")}
            {stat("%", r.has_data ? r.rh : null, "")}
          </div>
          <p className="tabular text-sm text-muted">{L.readings}: {r.readings}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <h2 className="mb-2 text-sm font-semibold">{L.alarms}</h2>
              {Object.keys(r.alarms).length === 0 ? <p className="text-sm text-muted">{L.noAlarms}</p> : (
                <ul className="space-y-1 text-sm">{Object.entries(r.alarms).map(([k, v]) => (<li key={k} className="flex justify-between"><Badge tone="warning">{k}</Badge><span className="tabular">{v}</span></li>))}</ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-2 text-sm font-semibold">{L.attendance}</h2>
              <dl className="tabular grid grid-cols-3 gap-2 text-center">
                {[[R.present, r.attendance.present], [R.late, r.attendance.late], [R.absent, r.attendance.absent]].map(([k, v]) => (<div key={String(k)}><dt className="text-xs text-muted">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
