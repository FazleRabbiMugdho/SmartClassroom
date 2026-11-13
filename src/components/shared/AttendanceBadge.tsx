import { Badge } from "@/components/ui/Badge";

const tone = { PRESENT: "safe", LATE: "warning", ABSENT: "danger" } as const;

export function AttendanceBadge({ status, labels }: { status: string | null | undefined; labels: { present: string; late: string; absent: string; notMarked: string } }) {
  if (!status) return <Badge>{labels.notMarked}</Badge>;
  const key = status as keyof typeof tone;
  return <Badge tone={tone[key] ?? "neutral"}>{key === "PRESENT" ? labels.present : key === "LATE" ? labels.late : key === "ABSENT" ? labels.absent : status}</Badge>;
}
