import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
export interface RoleGrant {
  school_id: string;
  role: AppRole;
}

// Thrown by guards. The route/handler maps .status to the HTTP response.
export class AuthzError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthzError(401, "authentication required");
  return user;
}

// Authoritative role lookup (never trust a client claim). Service client, explicit query.
export async function getUserRoles(userId: string): Promise<RoleGrant[]> {
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("user_roles")
    .select("school_id, role")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as RoleGrant[];
}

export async function requireRole(allowed: AppRole[]): Promise<{ user: User; roles: RoleGrant[] }> {
  const user = await requireUser();
  const roles = await getUserRoles(user.id);
  if (!roles.some((r) => allowed.includes(r.role))) {
    // 403 with no detail about what exists (do not leak private record existence).
    throw new AuthzError(403, "forbidden");
  }
  return { user, roles };
}

export async function assertAdmin(): Promise<{ user: User; roles: RoleGrant[] }> {
  return requireRole(["ADMIN"]);
}

// Admin of the room's school, or the assigned teacher. Mirrors the DB can_read_room().
export async function assertCanReadRoom(roomId: string): Promise<User> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { data: room } = await svc.from("rooms").select("school_id").eq("id", roomId).maybeSingle();
  if (!room) throw new AuthzError(403, "forbidden");

  const [{ data: adminRole }, { data: membership }] = await Promise.all([
    svc.from("user_roles").select("id").eq("user_id", user.id).eq("role", "ADMIN").eq("school_id", room.school_id).maybeSingle(),
    svc.from("room_memberships").select("id").eq("user_id", user.id).eq("room_id", roomId).eq("membership_role", "TEACHER").maybeSingle(),
  ]);
  if (!adminRole && !membership) throw new AuthzError(403, "forbidden");
  return user;
}
