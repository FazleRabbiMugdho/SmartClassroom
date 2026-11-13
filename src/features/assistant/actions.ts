"use server";

import { z } from "zod";
import { requireUser, getUserRoles } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildAnswer, detectLang, parseQuestion, type Report } from "./assistant";

export interface AskState { ok: boolean; answer?: string; hasData?: boolean; sources?: { label: string; value: string }[]; error?: "unsupported" | "forbidden" | "room" }

// Teacher/Admin only. The question is mapped to a fixed intent; the only data access is the
// RLS-scoped daily_report() function for a room the caller can already see. The raw question is
// never stored (only intent + date + whether data existed).
export async function askAssistantAction(_p: AskState, fd: FormData): Promise<AskState> {
  const user = await requireUser().catch(() => null);
  if (!user) return { ok: false, error: "forbidden" };
  const roles = (await getUserRoles(user.id)).map((r) => r.role);
  if (!roles.includes("TEACHER") && !roles.includes("ADMIN")) return { ok: false, error: "forbidden" };

  const parsedIn = z.object({ roomId: z.string().uuid(), question: z.string().trim().min(1).max(300) }).safeParse({ roomId: fd.get("roomId"), question: fd.get("question") });
  if (!parsedIn.success) return { ok: false, error: "unsupported" };
  const { roomId, question } = parsedIn.data;

  const lang = detectLang(question);
  const parsed = parseQuestion(question);
  if (!parsed || !parsed.date) return { ok: false, error: "unsupported" };

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle(); // RLS scope
  if (!room) return { ok: false, error: "room" };

  const { data } = await supabase.rpc("daily_report", { p_room: roomId, p_date: parsed.date });
  const answer = buildAnswer(parsed.intent, data as Report, lang);

  await createSupabaseServiceClient().from("assistant_queries").insert({
    user_id: user.id, room_id: roomId, intent: parsed.intent.kind, report_date: parsed.date, had_data: answer.hasData,
  });
  return { ok: true, answer: answer.text, hasData: answer.hasData, sources: answer.sources };
}
