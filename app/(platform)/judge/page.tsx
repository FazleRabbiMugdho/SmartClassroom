import { cookies } from "next/headers";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLevelStatus, getResults, getRuns, summarize } from "@/features/judge/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";

type Lvl = { level_no: number; name: string; group_name: string; marks: number };

// Judge & Evidence Centre. A level is complete only after a live PASS and its uploaded evidence;
// toggling a checklist never completes a level. Hardware proof and software proof are shown apart.
export default async function JudgePage() {
  await pageRole(["ADMIN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "jdg");
  const s = await createSupabaseServerClient();
  const { data } = await s.from("competition_levels").select("level_no, name, group_name, marks").order("level_no");
  const levels = (data ?? []) as Lvl[];

  const rows = await Promise.all(levels.map(async (l) => {
    const [st, runs] = await Promise.all([getLevelStatus(s, l.level_no), getRuns(s, l.level_no)]);
    const latest = runs[runs.length - 1];
    const sum = summarize(await getResults(s, latest ? [latest.id] : []));
    return { l, st, sum, latest };
  }));
  const earned = rows.reduce((t, r) => t + (r.st.complete ? Math.round((r.l.marks * r.st.award_pct) / 100) : 0), 0);
  const total = levels.reduce((t, l) => t + l.marks, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
        <Link href="/judge/evidence" className="text-sm text-indigo hover:underline">{L.readiness}</Link>
        <span className="tabular ml-auto text-sm text-muted">{L.marks}: <strong className="text-ink">{earned}</strong> / {total}</span>
      </div>
      <p className="text-xs text-muted">{L.rules}</p>
      <Table rows={rows} rowKey={(r) => String(r.l.level_no)} columns={[
        { key: "n", header: "#", mono: true, render: (r) => r.l.level_no },
        { key: "name", header: L.level, render: (r) => <Link href={`/judge/levels/${r.l.level_no}`} className="font-medium text-indigo hover:underline">{r.l.name}</Link> },
        { key: "g", header: L.group, render: (r) => <span className="text-xs text-muted">{r.l.group_name}</span> },
        { key: "m", header: L.marks, mono: true, render: (r) => r.l.marks },
        { key: "att", header: L.attempts, mono: true, render: (r) => `${r.st.attempts}/2` },
        { key: "st", header: L.status, render: (r) => r.st.complete ? <Badge tone="safe">{L.complete}</Badge> : r.st.passed ? <Badge tone="warning">{L.passedNoEvidence} ({r.st.award_pct}%)</Badge> : r.st.closed ? <Badge tone="danger">{L.closed}</Badge> : !r.st.previous_passed ? <Badge>{L.locked}</Badge> : <Badge tone="info">{L.open}</Badge> },
        { key: "hw", header: L.hardware, mono: true, render: (r) => r.latest ? `${r.sum.hardwareProvenReal}/${r.sum.hardwareTotal}` : "—" },
        { key: "ev", header: L.evidence, render: (r) => <span className="inline-flex gap-1">{(["video", "writeup", "code"] as const).map((k) => <Badge key={k} tone={r.st.evidence[k] ? "safe" : "neutral"}>{k === "video" ? "V" : k === "writeup" ? "W" : "C"}</Badge>)}</span> },
      ]} />
    </div>
  );
}
