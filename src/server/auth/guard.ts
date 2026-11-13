import { redirect } from "next/navigation";
import { requireUser, getUserRoles, AuthzError, type AppRole } from "./session";
import { primaryRole } from "@/components/shell/nav";

export interface PageContext {
  userId: string;
  role: AppRole;
  roles: AppRole[];
  schoolIds: string[];
}

/** Page-level gate: unauthenticated -> /login, wrong role -> /denied. */
export async function pageRole(allowed: AppRole[]): Promise<PageContext> {
  try {
    const user = await requireUser();
    const grants = await getUserRoles(user.id);
    const roles = grants.map((g) => g.role);
    if (!roles.some((r) => allowed.includes(r))) throw new AuthzError(403, "forbidden");
    return { userId: user.id, role: primaryRole(roles), roles, schoolIds: [...new Set(grants.map((g) => g.school_id))] };
  } catch (e) {
    if (e instanceof AuthzError) redirect(e.status === 401 ? "/login" : "/denied");
    throw e;
  }
}

export const STAFF: AppRole[] = ["ADMIN", "TEACHER"];
