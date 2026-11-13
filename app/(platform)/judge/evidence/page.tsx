import { cookies } from "next/headers";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLevelStatus, getResults, getRuns, summarize } from "@/features/judge/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// Readiness: what is still missing, and what is only simulated. Never marks anything complete itself.
export default async function EvidencePage() {
  await pageRole(["ADMIN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "jdg");
  const s = await createSupabaseServerClient();
  const { data } = await s.from("competition_levels").select("level_no, name").order("level_no");

  const items = await Promise.all(((data ?? []) as { level_no: number; name: string }[]).map(async (l) => {
    const [st, runs] = await Promise.all([getLevelStatus(s, l.level_no), getRuns(s, l.level_no)]);
    const sum = summarize(await getResults(s, runs.length ? [runs[runs.length - 1].id] : []));
    const gaps: string[] = [];
    if (!st.passed) gaps.push(runs.length === 0 ? L.gapNoAttempt : L.gapNotPassed);
    if (sum.hardwareUnproven > 0) gaps.push(`${sum.hardwareUnproven} ${L.gapHardware}`);
    if (!st.evidence.video) gaps.push(L.gapVideo);
    if (!st.evidence.writeup) gaps.push(L.gapWriteup);
    if (!st.evidence.code) gaps.push(L.gapCode);
    return { l, st, gaps };
  }));
  const ready = items.filter((i) => i.st.complete).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/judge" className="text-sm text-indigo hover:underline">← {L.title}</Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.readiness}</h1>
        <Badge tone="safe">{ready}/12 {L.complete}</Badge>
        <a href="/api/judge/manifest" className="ml-auto text-sm text-indigo hover:underline">{L.exportManifest}</a>
      </div>
      <p className="text-xs text-muted">{L.simNote}</p>
      <ul className="space-y-2">
        {items.map(({ l, st, gaps }) => (
          <li key={l.level_no}>
            <Card className="flex flex-wrap items-start gap-3">
              <Link href={`/judge/levels/${l.level_no}`} className="font-medium text-indigo hover:underline">{l.level_no}. {l.name}</Link>
              <div className="ml-auto flex flex-wrap justify-end gap-1.5">
                {st.complete ? <Badge tone="safe">{L.complete}</Badge> : gaps.map((g) => <Badge key={g} tone="warning">{g}</Badge>)}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
