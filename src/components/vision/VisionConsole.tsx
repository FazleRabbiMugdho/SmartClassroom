"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Users, Hand, ScanEye } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loadVision, type VisionData } from "@/features/vision/load";
import { selectPositionAction, setNightModeAction } from "@/features/vision/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionForm } from "@/components/ui/ActionForm";
import { Input, Field } from "@/components/ui/Input";
import { setCapacityAction } from "@/features/vision/actions";
import { CameraViewport } from "./CameraViewport";
import { SeatOccupancyMap } from "./SeatOccupancyMap";
import { DataFreshnessLabel } from "@/components/shared/DataFreshnessLabel";
import { formatDhakaTime } from "@/lib/time";

const TABLES = ["room_vision_live", "room_camera_state", "handraise_events", "security_incidents"] as const;

export function VisionConsole({ roomId, initial, role, labels, locale }: {
  roomId: string; initial: VisionData; role: "ADMIN" | "TEACHER"; labels: Record<string, string>; locale: "en" | "bn";
}) {
  const [d, setD] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [rate, setRate] = useState(0); // measured live updates per second (rolling 5 s)
  const stamps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const next = await loadVision(createSupabaseBrowserClient(), roomId);
    if (next) setD(next);
  }, [roomId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(`vision:${roomId}`);
    for (const table of TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        const t = Date.now();
        stamps.current = [...stamps.current.filter((x) => t - x < 5000), t];
        setRate(stamps.current.length / 5);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(refetch, 150);
      });
    }
    ch.subscribe((s) => { if (s === "SUBSCRIBED") void refetch(); });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { void supabase.removeChannel(ch); clearInterval(tick); if (timer.current) clearTimeout(timer.current); };
  }, [roomId, refetch]);

  const live = d.live;
  const age = live ? Math.max(0, (now - Date.parse(live.updated_at)) / 1000) : null;
  const stale = age !== null && age > 10;
  const zonesView = d.zones.map((z) => ({ ...z, occupied: (live?.stable_seats ?? []).includes(z.seat_no) }));
  const sel = d.camera?.selected_position ?? null;
  const conf = d.camera?.confirmed_position ?? null;
  const pending = sel !== null && sel !== conf;
  const cap = d.room.capacity;
  const refUrl = (p: "DOOR" | "ROOM" | null) => (p && d.hasReference[p] ? `/api/rooms/${roomId}/reference/${p}` : null);

  return (
    <div className="space-y-5">
      {live?.synthetic && <p role="note" className="rounded-lg border border-amber-200 bg-amber-tint px-3 py-2 text-sm text-warning">{labels.synthetic}</p>}
      {live?.over_capacity && <p role="alert" className="rounded-xl bg-danger px-4 py-3 font-semibold text-white">{labels.overCapacity} — {live.stable_count}/{cap}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <CameraViewport roomId={roomId} referenceUrl={refUrl(live?.position ?? conf ?? sel ?? "ROOM")} boxes={live?.boxes ?? []} zones={zonesView}
            tamperState={live?.tamper_state ?? "OK"} labels={labels} enabled />
          <div className="tabular flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span>{labels.fps}: {live?.fps ?? "—"}</span>
            <span>{labels.updatesPerSec}: {rate.toFixed(1)}</span>
            <span>{labels.model}: {live?.model_version ?? "—"}</span>
            {age !== null && <DataFreshnessLabel ageSeconds={age} staleAfterS={10} />}
            {stale && <Badge tone="warning">{labels.streamStale}</Badge>}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ScanEye className="size-4 text-muted" aria-hidden />{labels.cameraPosition}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="info">{labels.selected}: {sel ?? "—"}</Badge>
              <Badge tone={pending ? "warning" : "safe"}>{labels.confirmed}: {conf ?? "—"}</Badge>
              {pending && <span className="text-xs text-warning">{labels.reaim}</span>}
            </div>
            {conf === "ROOM" && <p className="text-xs text-muted">{labels.roomBlocksCheckin}</p>}
            <div className="flex gap-2">
              {(["DOOR", "ROOM"] as const).map((p) => (
                <ActionForm key={p} action={selectPositionAction} submitLabel={p} variant={sel === p ? "primary" : "secondary"} disabled={!d.hasReference[p]}>
                  <input type="hidden" name="roomId" value={roomId} /><input type="hidden" name="position" value={p} />
                </ActionForm>
              ))}
            </div>
          </Card>

          <Card className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-muted" aria-hidden />{labels.occupancy}</h2>
            <p className="tabular text-3xl font-semibold">{live ? live.stable_count : "—"}<span className="text-base font-normal text-muted"> / {cap ?? "—"}</span></p>
            <p className="text-xs text-muted">{labels.holdNote}</p>
            {role === "ADMIN" && (
              <ActionForm action={setCapacityAction} submitLabel={labels.setCapacity} variant="secondary">
                <input type="hidden" name="roomId" value={roomId} />
                <Field label={labels.capacity} htmlFor="capacity"><Input id="capacity" name="capacity" type="number" min={1} max={500} defaultValue={cap ?? ""} /></Field>
              </ActionForm>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Moon className="size-4 text-muted" aria-hidden />{labels.nightWatch}</h2>
            <p className="text-sm">{d.room.night_mode ? labels.nightOn : labels.nightOff}{live?.intruder_active && <Badge tone="danger" className="ml-2">INTRUDER</Badge>}</p>
            <ActionForm action={setNightModeAction} submitLabel={d.room.night_mode ? labels.turnOff : labels.turnOn} variant="secondary">
              <input type="hidden" name="roomId" value={roomId} /><input type="hidden" name="on" value={String(!d.room.night_mode)} />
            </ActionForm>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{labels.seatMap}</h2>
          <SeatOccupancyMap seats={d.zones} occupied={live?.stable_seats ?? []} raisedToday={d.raisesToday} labels={labels} />
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">{labels.cameraHealth}</h2>
            <dl className="tabular space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{labels.state}</dt><dd className="font-semibold">{live?.tamper_state ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{labels.coverScore}</dt><dd>{live?.cover_score ?? "—"} / {live?.cover_threshold ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{labels.moveScore}</dt><dd>{live?.move_score ?? "—"} / {live?.move_threshold ?? "—"}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">{labels.scoreNote}</p>
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Hand className="size-4 text-muted" aria-hidden />{labels.handRaised}</h2>
            {d.recentRaises.length === 0 ? <p className="text-sm text-muted">{labels.noRaises}</p> : (
              <ul className="space-y-1 text-sm">{d.recentRaises.map((r, i) => (<li key={i} className="tabular"><span className="text-muted">{formatDhakaTime(r.occurred_at, locale)}</span> · {labels.handRaised} – {labels.seat} {r.seat_no}</li>))}</ul>
            )}
          </Card>
        </div>
      </div>

      {d.incidents.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">{labels.alerts}</h2>
          <ul className="space-y-1.5 text-sm">
            {d.incidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">{i.incident_type.replace(/_/g, " ")}</Badge>
                <span className="tabular text-muted">{formatDhakaTime(i.occurred_at, locale)}</span>
                {i.snapshot_id && <a className="text-indigo hover:underline" href={`/api/snapshots/${i.snapshot_id}`} target="_blank" rel="noreferrer">{labels.snapshot}</a>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
