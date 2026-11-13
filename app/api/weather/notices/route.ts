import { getSessionUser } from "@/server/auth/session";
import { getActiveNotices } from "@/features/weather/queries";

export async function GET() {
  if (!(await getSessionUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ notices: await getActiveNotices() });
}
