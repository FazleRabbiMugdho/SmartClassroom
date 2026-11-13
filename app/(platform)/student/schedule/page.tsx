import { cookies } from "next/headers";
import { CalendarDays } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { formatDhakaDateTime } from "@/lib/time";

export default async function StudentSchedule() {
  await pageRole(["STUDENT"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("class_enrollments")
    .select("class:class_sessions(id, title, starts_at)").limit(50);
  const classes = ((data ?? []) as unknown as { class: { id: string; title: string; starts_at: string } | null }[])
    .map((r) => r.class).filter((c): c is { id: string; title: string; starts_at: string } => !!c && Date.parse(c.starts_at) > Date.now() - 3_600_000)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.upcoming}</h1>
      {classes.length === 0 ? <EmptyState icon={CalendarDays} title={L.noUpcoming} /> : (
        <ul className="space-y-2">{classes.map((c) => (
          <li key={c.id}><Card className="flex items-center justify-between"><span className="font-medium">{c.title}</span><span className="tabular text-sm text-muted">{formatDhakaDateTime(c.starts_at, locale)}</span></Card></li>
        ))}</ul>
      )}
    </div>
  );
}
