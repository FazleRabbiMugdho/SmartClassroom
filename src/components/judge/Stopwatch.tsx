"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Flag, Pin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

const fmt = (ms: number) => {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};

/** On-screen stopwatch for timed items and video recording. Can be pinned to the corner. Laps are kept for the write-up. */
export function Stopwatch({ labels }: { labels: Record<string, string> }) {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const t0 = useRef(0);
  const base = useRef(0);

  useEffect(() => {
    if (!running) return;
    t0.current = performance.now();
    let raf = 0;
    const tick = () => { setMs(base.current + performance.now() - t0.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); base.current += performance.now() - t0.current; };
  }, [running]);

  const reset = () => { setRunning(false); base.current = 0; setMs(0); setLaps([]); };

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-card", pinned && "fixed bottom-4 right-4 z-50 w-64")}>
      <p className="tabular text-4xl font-semibold tracking-tight" aria-live="off">{fmt(ms)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setRunning((r) => !r)}>{running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}{running ? labels.stop : labels.start}</Button>
        <Button size="sm" variant="secondary" onClick={() => setLaps((l) => [...l, ms])} disabled={!running}><Flag className="size-4" aria-hidden />{labels.lap}</Button>
        <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="size-4" aria-hidden />{labels.reset}</Button>
        <Button size="sm" variant="ghost" onClick={() => setPinned((p) => !p)} aria-pressed={pinned}><Pin className="size-4" aria-hidden />{labels.pin}</Button>
      </div>
      {laps.length > 0 && <ol className="tabular mt-3 space-y-0.5 text-xs text-muted">{laps.map((l, i) => (<li key={i}>#{i + 1} {fmt(l)}</li>))}</ol>}
    </div>
  );
}
