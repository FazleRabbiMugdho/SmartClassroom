import { requireStaffApi } from "@/server/auth/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signStreamToken } from "@/server/vision/stream";

// Teacher/Admin of THIS room only (Students/Guardians get 403, an out-of-scope room 404).
// Returns a 60-second signed URL for the external stream worker; nothing is proxied here.
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const gate = await requireStaffApi();
  if (gate instanceof Response) return gate;
  const { roomId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle(); // RLS scope
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });

  const base = process.env.STREAM_WORKER_URL;
  const secret = process.env.STREAM_SIGNING_SECRET;
  if (!base || !secret) return Response.json({ error: "stream_not_configured" }, { status: 503 });

  const token = signStreamToken(roomId, secret, 60);
  return Response.json({ url: `${base.replace(/\/$/, "")}/stream/${roomId}?token=${token}`, expires_in_s: 60 });
}
