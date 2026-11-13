"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshnessLabel } from "@/components/shared/DataFreshnessLabel";
import { cn } from "@/components/ui/cn";

export interface CsiLive {
  presence: "EMPTY" | "OCCUPIED"; predicted_zone: string | null; confidence: number | null; packets_per_s: number | null;
  packets_lost: number | null; subcarriers: number | null; wifi_channel: number | null; model_version: string | null; synthetic: boolean; updated_at: string;
}

const ZONES = ["ZONE_1", "ZONE_2", "ZONE_3", "ZONE_4"] as const; // grid: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right

/** Live 2x2 map from CSI predictions alone (the camera never feeds this). Realtime + 1 s freshness tick. */
export function CsiZoneMap({ roomId, initial, labels }: { roomId: string; initial: CsiLive | null; labels: Record<string, string> }) {
  const [live, setLive] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    const { data } = await createSupabaseBrowserClient().from("room_csi_live").select("*").eq("room_id", roomId).maybeSingle();
    if (data) setLive(data as CsiLive);
  }, [roomId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(`csi:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_csi_live" }, () => void refetch())
      .subscribe((s) => { if (s === "SUBSCRIBED") void refetch(); });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { void supabase.removeChannel(ch); clearInterval(tick); };
  }, [roomId, refetch]);

  const age = live ? Math.max(0, (now - Date.parse(live.updated_at)) / 1000) : null;
  const stale = age !== null && age > 5;
  const rate = live?.packets_per_s ?? null;

  return (
    <Card className="space-y-4">
      {live?.synthetic && <p role="note" className="rounded-lg border border-amber-200 bg-amber-tint px-3 py-2 text-sm text-warning">{labels.synthetic}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={live?.presence === "OCCUPIED" ? "info" : "neutral"}>{live ? (live.presence === "OCCUPIED" ? labels.occupied : labels.empty) : labels.noData}</Badge>
        {age !== null && <DataFreshnessLabel ageSeconds={age} staleAfterS={5} />}
        {stale && <Badge tone="warning">{labels.stale}</Badge>}
      </div>

      <div className="grid aspect-square max-w-xs grid-cols-2 gap-2" role="img" aria-label={labels.mapAlt}>
        {ZONES.map((z, i) => {
          const on = !stale && live?.predicted_zone === z;
          return (
            <div key={z} className={cn("grid place-items-center rounded-xl border-2 text-lg font-semibold transition-colors", on ? "border-indigo bg-periwinkle text-indigo" : "border-border bg-card text-muted")}>
              <span>Z{i + 1}{on && <span className="ml-1 text-xs">●</span>}</span>
            </div>
          );
        })}
      </div>
      <p className="tabular text-xs text-muted">
        {labels.zone}: {live?.predicted_zone ?? "—"} · {labels.confidence}: {live?.confidence ?? "—"}
      </p>

      <dl className="tabular grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">{labels.packetRate}</dt><dd className={cn("font-semibold", rate !== null && rate < 20 && "text-danger")}>{rate ?? "—"} /s</dd></div>
        <div><dt className="text-xs text-muted">{labels.packetsLost}</dt><dd>{live?.packets_lost ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted">{labels.subcarriers}</dt><dd>{live?.subcarriers ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted">{labels.channel}</dt><dd>{live?.wifi_channel ?? "—"}</dd></div>
      </dl>
      {rate !== null && rate < 20 && <p role="alert" className="text-xs text-danger">{labels.rateLow}</p>}
    </Card>
  );
}
