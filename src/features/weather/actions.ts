"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, AuthzError } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/components/ui/ActionForm";

const guard = (fn: (p: ActionState, fd: FormData) => Promise<ActionState>) =>
  async (p: ActionState, fd: FormData): Promise<ActionState> => {
    try { return await fn(p, fd); }
    catch (e) { return { ok: false, message: e instanceof AuthzError ? "Only Admins can do this." : e instanceof Error ? e.message : "Something went wrong." }; }
  };

// Admin TEST notices exercise the real banner + device-delivery path (a DANGER one fans out to
// every device and every dashboard in the same transaction, via a DB trigger).
export const addTestNoticeAction = guard(async (_p, fd) => {
  const { user, roles } = await assertAdmin();
  const p = z.object({
    category: z.enum(["STORM", "CYCLONE", "HEAVY_RAIN_FLOOD", "HEATWAVE"]),
    severity: z.enum(["ADVISORY", "WARNING", "DANGER"]),
    hours: z.coerce.number().min(1).max(48),
    text: z.string().trim().min(1).max(280),
  }).safeParse({ category: fd.get("category"), severity: fd.get("severity"), hours: fd.get("hours"), text: fd.get("text") });
  if (!p.success) return { ok: false, message: "Choose a category and severity, and enter the notice text." };

  const start = new Date(Date.now() - 60_000); // active immediately
  const { error } = await createSupabaseServiceClient().from("weather_notices").insert({
    school_id: roles.find((r) => r.role === "ADMIN")!.school_id, category: p.data.category, severity: p.data.severity,
    source_kind: "TEST", source_name: "Admin test notice", window_start: start.toISOString(),
    window_end: new Date(start.getTime() + p.data.hours * 3_600_000).toISOString(), notice_text: p.data.text, created_by: user.id,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/weather");
  return { ok: true, message: p.data.severity === "DANGER" ? "TEST danger notice sent to dashboards and devices." : "TEST notice added." };
});

export const withdrawNoticeAction = guard(async (_p, fd) => {
  await assertAdmin();
  const id = z.string().uuid().parse(fd.get("noticeId"));
  const { error } = await createSupabaseServiceClient().from("weather_notices").update({ withdrawn_at: new Date().toISOString() }).eq("id", id).eq("source_kind", "TEST");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/weather");
  return { ok: true, message: "Removed." };
});
