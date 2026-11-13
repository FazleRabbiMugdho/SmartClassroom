import { Badge } from "@/components/ui/Badge";
import type { EventRow } from "@/features/rooms/queries";
import { formatDhakaTime } from "@/lib/time";

const tone = (type: string) =>
  ["FIRE", "PANIC", "SENSOR_ERROR", "CAMERA_FAULT", "FACE_MISMATCH", "SPOOF", "INTRUDER", "OTA_ROLLBACK"].includes(type) ? "danger"
  : ["ENTRY_DENIED", "NO_FACE", "OTA_REJECTED", "OVER_CAPACITY"].includes(type) ? "warning"
  : ["ENTRY_GRANTED", "FIRE_CLEARED", "CAMERA_OK", "OTA_DONE", "SETTINGS_APPLIED"].includes(type) ? "safe"
  : "info";

export function EventTimeline({ events, empty }: { events: EventRow[]; empty: string }) {
  if (events.length === 0) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-border/70">
      {events.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2.5">
          <span className="tabular w-[72px] shrink-0 text-xs text-muted">{formatDhakaTime(e.device_ts ?? e.received_at)}</span>
          <Badge tone={tone(e.event_type)}>{e.event_type}</Badge>
          {e.is_offline_sync && <Badge tone="warning">offline sync</Badge>}
          <span className="min-w-0 truncate text-xs text-muted">
            {typeof e.detail?.uid === "string" ? `uid ${e.detail.uid}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
