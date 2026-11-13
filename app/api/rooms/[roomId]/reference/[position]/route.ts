import { getSessionUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Reference snapshot (DOOR/ROOM) for the seat editor and viewport background. RLS decides who may
// read the row (Teacher/Admin of the room); only then a 60-second signed URL is minted.
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string; position: string }> }) {
  if (!(await getSessionUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { roomId, position } = await params;
  if (position !== "DOOR" && position !== "ROOM") return Response.json({ error: "not_found" }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("camera_positions").select("reference_bucket, reference_object_key").eq("room_id", roomId).eq("position", position).maybeSingle();
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const { data: signed } = await createSupabaseServiceClient().storage.from(data.reference_bucket).createSignedUrl(data.reference_object_key, 60);
  return signed ? Response.redirect(signed.signedUrl, 302) : Response.json({ error: "not_found" }, { status: 404 });
}
