"use client";

import { useEffect, useState } from "react";
import { VideoOff } from "lucide-react";
import { CameraFaultOverlay } from "./CameraFaultOverlay";
import type { Box, Pt } from "@/features/vision/geometry";

export interface ViewZone { seat_no: number; polygon: Pt[]; occupied: boolean }

/**
 * Live view (Teacher/Admin only). The video comes from an external stream worker via a 60 s signed
 * URL; we never proxy or store frames. Person boxes and seat zones are drawn from the live state
 * (normalized coordinates) so they stay aligned at any size. If no stream is configured, the
 * reference snapshot is shown under the boxes with a clear "not connected" notice.
 */
export function CameraViewport({ roomId, referenceUrl, boxes, zones, tamperState, labels, enabled }: {
  roomId: string; referenceUrl: string | null; boxes: (Box & { confidence?: number })[]; zones: ViewZone[];
  tamperState: "OK" | "COVERED" | "MOVED"; labels: Record<string, string>; enabled: boolean;
}) {
  const [stream, setStream] = useState<{ url: string } | { error: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      const r = await fetch(`/api/rooms/${roomId}/stream`, { cache: "no-store" });
      if (!alive) return;
      setStream(r.ok ? await r.json() : { error: r.status === 503 ? "not_configured" : "denied" });
    };
    void load();
    const id = setInterval(load, 50_000); // tokens live 60 s: renew before expiry
    return () => { alive = false; clearInterval(id); };
  }, [roomId, enabled]);

  const url = stream && "url" in stream ? stream.url : null;
  const bg = url ?? referenceUrl;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {bg ? <img src={bg} alt={labels.viewportAlt} className="absolute inset-0 size-full object-contain" /> : (
        <div className="absolute inset-0 grid place-items-center text-white/70"><VideoOff className="size-8" aria-hidden /></div>
      )}
      <svg className="absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        {zones.map((z) => (
          <polygon key={z.seat_no} points={z.polygon.map((p) => p.join(",")).join(" ")}
            fill={z.occupied ? "rgba(79,70,229,0.28)" : "rgba(255,255,255,0.06)"} stroke={z.occupied ? "#818cf8" : "rgba(255,255,255,0.55)"} strokeWidth={0.003} />
        ))}
        {boxes.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#22c55e" strokeWidth={0.004} />
        ))}
      </svg>
      {!url && <p className="absolute bottom-2 left-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white">{stream && "error" in stream && stream.error === "not_configured" ? labels.streamOff : labels.streamWaiting}</p>}
      <CameraFaultOverlay state={tamperState} labels={labels} />
    </div>
  );
}
