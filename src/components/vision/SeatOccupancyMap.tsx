import { cn } from "@/components/ui/cn";

// Compact seat map: one chip per saved zone, occupied seats highlighted (icon + word, not colour alone).
export function SeatOccupancyMap({ seats, occupied, raisedToday, labels }: {
  seats: { seat_no: number; label: string | null }[]; occupied: number[]; raisedToday: Record<number, number>; labels: Record<string, string>;
}) {
  if (seats.length === 0) return <p className="text-sm text-muted">{labels.noZones}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={labels.seatMap}>
      {seats.map((s) => {
        const on = occupied.includes(s.seat_no);
        return (
          <li key={s.seat_no} className={cn("rounded-lg border px-3 py-2", on ? "border-indigo/40 bg-periwinkle" : "border-border bg-card")}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{s.label ?? `Seat ${s.seat_no}`}</span>
              <span className={cn("text-xs font-semibold", on ? "text-indigo" : "text-muted")}>{on ? labels.occupied : labels.free}</span>
            </div>
            <p className="tabular mt-0.5 text-xs text-muted">{labels.raisesToday}: {raisedToday[s.seat_no] ?? 0}</p>
          </li>
        );
      })}
    </ul>
  );
}
