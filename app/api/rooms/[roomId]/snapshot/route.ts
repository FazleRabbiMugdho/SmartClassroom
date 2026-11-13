import { getSessionUser } from "@/server/auth/session";
import { getRoomSnapshot } from "@/features/rooms/queries";

// Source of truth for the dashboard. Realtime only signals "something changed";
// the client refetches here, which also reconciles state after a reconnect.
// Scope is enforced by RLS: an out-of-scope room returns 404, identical to a missing one.
export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { roomId } = await params;
  const minutes = Math.min(1440, Math.max(5, Number(new URL(req.url).searchParams.get("minutes") ?? 60) || 60));
  const snap = await getRoomSnapshot(roomId, minutes);
  if (!snap.room) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(snap);
}
