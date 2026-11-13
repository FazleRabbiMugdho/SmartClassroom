import { getSessionUser, getUserRoles } from "./session";

/** Staff-only API gate (Student/Guardian get 403; nothing about existence is revealed). */
export async function requireStaffApi(): Promise<{ userId: string } | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roles = (await getUserRoles(user.id)).map((r) => r.role);
  if (!roles.includes("ADMIN") && !roles.includes("TEACHER")) return Response.json({ error: "forbidden" }, { status: 403 });
  return { userId: user.id };
}

/** Admin-only API gate. */
export async function requireAdminApi(): Promise<{ userId: string } | Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roles = (await getUserRoles(user.id)).map((r) => r.role);
  return roles.includes("ADMIN") ? { userId: user.id } : Response.json({ error: "forbidden" }, { status: 403 });
}
