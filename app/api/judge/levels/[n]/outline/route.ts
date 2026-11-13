import { requireAdminApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResults, getRuns } from "@/features/judge/queries";

// The paper's five write-up headings, prefilled with the real recorded results.
export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const level = Number((await params).n);
  if (!Number.isInteger(level) || level < 1 || level > 12) return Response.json({ error: "not_found" }, { status: 404 });

  const s = await createSupabaseServerClient();
  const { data: lvl } = await s.from("competition_levels").select("name, marks").eq("level_no", level).maybeSingle();
  const runs = await getRuns(s, level);
  const results = await getResults(s, runs.length ? [runs[runs.length - 1].id] : []);
  const { data: refs } = await s.from("level_code_references").select("git_tag, commit_sha").eq("level_no", level);

  const src = (x: string) => ({ SOFTWARE_TEST: "software test", MOCK_DEVICE: "simulator (not hardware proof)", REAL_DEVICE_SELF_TEST: "real device, self test", REAL_DEVICE_JUDGE_OBSERVED: "real device, judge observed" } as Record<string, string>)[x] ?? x;
  const table = results.length === 0 ? "_No requirements recorded yet._" : [
    "| Requirement | Result | Measured | Limit | Evidence |", "|---|---|---|---|---|",
    ...results.map((r) => `| ${r.requirement_code}: ${r.description} | ${r.outcome} | ${r.measured_value ?? "—"} ${r.unit ?? ""} | ${r.limit_value ?? "—"} ${r.unit ?? ""} | ${src(r.evidence_source)} |`),
  ].join("\n");

  const md = `# Level ${level} — ${lvl?.name ?? ""}

## (1) Design
_What was built, with a diagram._

## (2) Where it shows
_Screenshots: Serial Monitor, local status page, dashboard, database records._

## (3) Test results
${table}

## (4) Problems and fixes
_…_

## (5) Extra item
_The level's extra write-up item (see the question paper)._

**Code:** ${(refs ?? []).map((r) => `${r.git_tag} @ ${r.commit_sha.slice(0, 12)}`).join(", ") || "_no tag recorded_"}
`;
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="level-${String(level).padStart(2, "0")}-writeup-outline.md"` } });
}
