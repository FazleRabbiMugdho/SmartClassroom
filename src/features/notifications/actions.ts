"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/components/ui/ActionForm";

// A user sets only their OWN phone channel (identity comes from the session, never the form).
export async function saveTelegramChannelAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const chat = z.string().trim().regex(/^-?\d{3,20}$/, "Telegram chat ID is a number (for example 123456789).").safeParse(fd.get("chatId"));
    if (!chat.success) return { ok: false, message: chat.error.issues[0].message };
    const { error } = await createSupabaseServiceClient().from("notification_channels")
      .upsert({ user_id: user.id, channel: "TELEGRAM", address: chat.data }, { onConflict: "user_id,channel" });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/notifications");
    return { ok: true, message: "Saved." };
  } catch {
    return { ok: false, message: "Please sign in again." };
  }
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await createSupabaseServiceClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_profile_id", user.id).is("read_at", null);
  revalidatePath("/notifications", "layout");
}
