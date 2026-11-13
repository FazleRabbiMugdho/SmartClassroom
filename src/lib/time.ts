// Storage/API are UTC. User-facing classroom time renders in Asia/Dhaka.
const TZ = "Asia/Dhaka";

export function formatDhakaTime(iso: string | null | undefined, locale: "en" | "bn" = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ,
  }).format(d);
}

export function formatDhakaDateTime(iso: string | null | undefined, locale: "en" | "bn" = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
  }).format(d);
}
