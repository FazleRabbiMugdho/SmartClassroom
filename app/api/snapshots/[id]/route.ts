import { getSessionUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Private snapshots are never public. The caller's RLS-bound client must be able to read
// the metadata row (Teacher/Admin of that room); only then do we mint a 60-second signed URL.
// A Student or Guardian gets the same 404 as a nonexistent id, even with the exact id.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: snap } = await supabase.from("private_snapshots").select("bucket, object_key").eq("id", id).maybeSingle();
  if (!snap) return Response.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await createSupabaseServiceClient().storage.from(snap.bucket).createSignedUrl(snap.object_key, 60);
  if (error || !data) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
