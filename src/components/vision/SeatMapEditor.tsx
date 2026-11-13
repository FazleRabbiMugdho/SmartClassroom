"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clamp01, rectToPolygon, type Pt } from "@/features/vision/geometry";
import { saveSeatZonesAction } from "@/features/vision/actions";

export interface EditorZone { seat_no: number; label: string; x: number; y: number; w: number; h: number }
type Drag = { kind: "draw" | "move" | "resize"; id: number; ox: number; oy: number; start: EditorZone };

const MIN = 0.03;

/** Zones are edited as rectangles in normalized (0..1) coordinates, so the layout scales to any display. */
export function toEditorZones(rows: { seat_no: number; label: string | null; polygon: Pt[] }[]): EditorZone[] {
  return rows.map((r) => {
    const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { seat_no: r.seat_no, label: r.label ?? `Seat ${r.seat_no}`, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  });
}

export function SeatMapEditor({ roomId, imageUrl, initial, labels }: { roomId: string; imageUrl: string | null; initial: EditorZone[]; labels: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null);
  const [zones, setZones] = useState<EditorZone[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const norm = (e: React.PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
  };
  const nextSeat = () => Math.max(0, ...zones.map((z) => z.seat_no)) + 1;
  const patch = (id: number, p: Partial<EditorZone>) => setZones((zs) => zs.map((z) => (z.seat_no === id ? { ...z, ...p } : z)));

  function down(e: React.PointerEvent, kind: Drag["kind"], id?: number) {
    e.stopPropagation();
    (box.current as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = norm(e);
    if (kind === "draw") {
      const seat = nextSeat();
      setZones((zs) => [...zs, { seat_no: seat, label: `Seat ${seat}`, x, y, w: 0, h: 0 }]);
      setSel(seat);
      setDrag({ kind, id: seat, ox: x, oy: y, start: { seat_no: seat, label: "", x, y, w: 0, h: 0 } });
    } else {
      const z = zones.find((q) => q.seat_no === id)!;
      setSel(id!);
      setDrag({ kind, id: id!, ox: x, oy: y, start: z });
    }
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const [x, y] = norm(e);
    const s = drag.start;
    if (drag.kind === "draw") patch(drag.id, { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) });
    else if (drag.kind === "move") patch(drag.id, { x: clamp01(Math.min(s.x + (x - drag.ox), 1 - s.w)), y: clamp01(Math.min(s.y + (y - drag.oy), 1 - s.h)) });
    else patch(drag.id, { w: Math.max(MIN, Math.min(s.w + (x - drag.ox), 1 - s.x)), h: Math.max(MIN, Math.min(s.h + (y - drag.oy), 1 - s.y)) });
  }
  function up() {
    if (drag?.kind === "draw") setZones((zs) => zs.filter((z) => z.seat_no !== drag.id || (z.w >= MIN && z.h >= MIN))); // a click is not a zone
    setDrag(null);
  }

  async function save() {
    setBusy(true); setMsg(null);
    const payload = zones.map((z) => ({ seat_no: z.seat_no, label: z.label, polygon: rectToPolygon(z.x, z.y, z.w, z.h) }));
    const r = await saveSeatZonesAction(roomId, JSON.stringify(payload));
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
  }

  const current = zones.find((z) => z.seat_no === sel);
  return (
    <div className="space-y-3">
      <div
        ref={box} onPointerDown={(e) => down(e, "draw")} onPointerMove={move} onPointerUp={up}
        className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-slate-900"
        role="application" aria-label={labels.editorHint}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl ? <img src={imageUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-contain" /> : <p className="absolute inset-0 grid place-items-center text-sm text-white/70">{labels.noReference}</p>}
        {zones.map((z) => (
          <div key={z.seat_no} onPointerDown={(e) => down(e, "move", z.seat_no)}
            style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}
            className={`absolute cursor-move border-2 ${sel === z.seat_no ? "border-indigo bg-indigo/25" : "border-white/80 bg-white/15"}`}>
            <span className="tabular absolute left-1 top-0.5 rounded bg-black/55 px-1 text-[11px] text-white">{z.seat_no}</span>
            <span onPointerDown={(e) => down(e, "resize", z.seat_no)} className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-indigo" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{labels.editorHint}</p>

      {current && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <label className="flex flex-col gap-1 text-[13px] text-muted">{labels.zoneName}
            <Input value={current.label} maxLength={40} onChange={(e) => patch(current.seat_no, { label: e.target.value })} className="w-48" />
          </label>
          <Button variant="secondary" size="sm" onClick={() => { setZones((zs) => zs.filter((z) => z.seat_no !== current.seat_no)); setSel(null); }}>
            <Trash2 className="size-4" aria-hidden /> {labels.deleteZone}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy || zones.length < 2}>{busy ? "…" : labels.saveZones}</Button>
        {zones.length < 2 && <span className="text-xs text-warning">{labels.needTwo}</span>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-safe" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
