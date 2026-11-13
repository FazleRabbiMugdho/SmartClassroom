"use server";

import { requireUser } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/components/ui/ActionForm";

// Reset fire: Teacher/Admin only, and only once the flame is gone. All of it is enforced in
// SQL (queue_fire_reset); the UI hiding the button is convenience, not authorization.
export async function resetFireAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const deviceId = String(formData.get("deviceId") ?? "");
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("queue_fire_reset", { p_device: deviceId, p_actor: user.id });
  if (error) {
    const msg = /FLAME PRESENT/.test(error.message) ? "CANNOT RESET — FLAME PRESENT"
      : /only/.test(error.message) ? "You do not have permission to reset fire."
      : error.message;
    return { ok: false, message: msg };
  }
  return { ok: true, message: "Reset requested. Waiting for the device to confirm." };
}
