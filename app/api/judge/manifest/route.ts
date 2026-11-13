import { requireAdminApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLevelStatus, getResults, getRuns } from "@/features/judge/queries";

// Evidence manifest for submission: per level status, attempts, results (with evidence source),
// uploaded files and code references. Reflects stored records only.
export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const s = await createSupabaseServerClient();
  const { data: levels } = await s.from("competition_levels").select("level_no, name, marks");

  const out = await Promise.all(((levels ?? []) as { level_no: number; name: string; marks: number }[]).map(async (l) => {
    const [status, runs] = await Promise.all([getLevelStatus(s, l.level_no), getRuns(s, l.level_no)]);
    const [results, arts, refs] = await Promise.all([
      getResults(s, runs.map((r) => r.id)),
      s.from("evidence_artifacts").select("kind, file_name, object_key, sha256, byte_size, uploaded_at").eq("level_no", l.level_no),
      s.from("level_code_references").select("git_tag, commit_sha").eq("level_no", l.level_no),
    ]);
    return { ...l, status, attempts: runs, results, artifacts: arts.data ?? [], code_refs: refs.data ?? [] };
  }));
  return new Response(JSON.stringify({ generated_at: new Date().toISOString(), levels: out }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="evidence-manifest.json"' },
  });
}
