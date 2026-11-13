"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, assertAdmin, AuthzError } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { embedFaces, InferenceUnavailable } from "@/server/inference/face";
import { CONSENT_NOTICE_SHA256, CONSENT_VERSION } from "./consent";
import type { ActionState } from "@/components/ui/ActionForm";

const fail = (message: string): ActionState => ({ ok: false, message });
const done = (message: string): ActionState => ({ ok: true, message });

async function adminSchool(): Promise<{ userId: string; schoolId: string }> {
  const { user, roles } = await assertAdmin();
  const school = roles.find((r) => r.role === "ADMIN")!.school_id;
  return { userId: user.id, schoolId: school };
}

function guard<T extends (...a: never[]) => Promise<ActionState>>(fn: T): T {
  return (async (...args: never[]) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthzError) return fail("You do not have permission to do this.");
      return fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  }) as T;
}

export const createStudentAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { schoolId } = await adminSchool();
  const parsed = z.object({ code: z.string().trim().min(1).max(32), name: z.string().trim().min(1).max(120), classLabel: z.string().trim().max(60).optional() })
    .safeParse({ code: fd.get("code"), name: fd.get("name"), classLabel: fd.get("classLabel") || undefined });
  if (!parsed.success) return fail("Student code and name are required.");
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("students").insert({ school_id: schoolId, student_code: parsed.data.code, full_name: parsed.data.name, class_label: parsed.data.classLabel ?? null });
  if (error) return fail(error.code === "23505" ? "That student code already exists." : error.message);
  revalidatePath("/students");
  return done("Student created.");
});

// Enrolment: consent first, >=3 photos processed in memory (never written to storage),
// embedding stored, enrolment complete ONLY if the inference service returned an embedding.
export const enrollFacesAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const studentId = z.string().uuid().parse(fd.get("studentId"));
  if (fd.get("consent") !== "on") return fail("Consent must be confirmed before enrolment.");
  const files = (fd.getAll("photos") as File[]).filter((f) => f.size > 0);
  if (files.length < 3) return fail("Provide at least 3 face photos.");
  if (files.some((f) => !f.type.startsWith("image/") || f.size > 5_000_000)) return fail("Photos must be images under 5 MB.");

  const svc = createSupabaseServiceClient();
  await svc.from("consent_records").insert({
    student_id: studentId, consent_version: CONSENT_VERSION, notice_sha256: CONSENT_NOTICE_SHA256,
    consented_at: new Date().toISOString(), recorded_by: userId,
  });
  await svc.from("students").update({ enrollment_status: "PENDING" }).eq("id", studentId);

  try {
    const images = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()).toString("base64")));
    const emb = await embedFaces(images);
    const { error } = await svc.from("face_embeddings").insert({
      student_id: studentId, model_name: emb.model, model_version: emb.version, dimensions: emb.dimensions,
      embedding: "\\x" + Buffer.from(emb.embeddingBase64, "base64").toString("hex"), source_image_count: files.length,
    });
    if (error) throw error;
    await svc.from("students").update({ enrollment_status: "ENROLLED" }).eq("id", studentId);
    revalidatePath(`/students/${studentId}`);
    return done(emb.synthetic ? "Enrolled with SYNTHETIC dev embedding (mock inference). Not real biometrics." : "Enrolment complete. Original photos were discarded.");
  } catch (e) {
    await svc.from("students").update({ enrollment_status: "FAILED" }).eq("id", studentId);
    revalidatePath(`/students/${studentId}`);
    return fail(e instanceof InferenceUnavailable
      ? "Face inference service is unavailable. Enrolment not completed; photos were not stored."
      : "Enrolment failed. Photos were not stored.");
  }
});

export const startCardRegistrationAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("start_card_registration", {
    p_student: z.string().uuid().parse(fd.get("studentId")), p_room: z.string().uuid().parse(fd.get("roomId")), p_actor: userId, p_ttl_seconds: 120,
  });
  if (error) return fail(error.message);
  revalidatePath("/access/cards");
  return done("Waiting for a card tap on the room's reader (2 minutes).");
});

export const removeCardAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const studentId = z.string().uuid().parse(fd.get("studentId"));
  const { error } = await createSupabaseServiceClient().rpc("remove_student_card", { p_student: studentId, p_actor: userId });
  if (error) return fail(error.message);
  revalidatePath("/access/cards");
  revalidatePath(`/students/${studentId}`);
  return done("Card link removed.");
});

// Precise confirmation: the Admin must type the student code. Biometric/card/snapshot
// data is removed in SQL; storage objects are queued for deletion with retry.
export const deleteStudentAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const studentId = z.string().uuid().parse(fd.get("studentId"));
  const svc = createSupabaseServiceClient();
  const { data: s } = await svc.from("students").select("student_code").eq("id", studentId).maybeSingle();
  if (!s) return fail("Student not found.");
  if (String(fd.get("confirm") ?? "").trim() !== s.student_code) return fail(`Type the student code (${s.student_code}) to confirm.`);
  const { error } = await svc.rpc("delete_student", { p_student_id: studentId, p_actor: userId });
  if (error) return fail(error.message);
  revalidatePath("/students");
  redirect("/students");
});

export const createClassAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const p = z.object({ roomId: z.string().uuid(), title: z.string().trim().min(1).max(120), startsAt: z.string().min(1), minutes: z.coerce.number().int().min(5).max(480) })
    .safeParse({ roomId: fd.get("roomId"), title: fd.get("title"), startsAt: fd.get("startsAt"), minutes: fd.get("minutes") });
  if (!p.success) return fail("Room, title, start time and length are required.");
  // datetime-local is entered in Dhaka time (UTC+6, no DST).
  const start = new Date(`${p.data.startsAt}:00+06:00`);
  if (Number.isNaN(start.getTime())) return fail("Invalid start time.");
  const end = new Date(start.getTime() + p.data.minutes * 60_000);
  const { error } = await createSupabaseServiceClient().from("class_sessions").insert({
    room_id: p.data.roomId, title: p.data.title, starts_at: start.toISOString(), ends_at: end.toISOString(), created_by: userId,
  });
  if (error) return fail(/overlapping/.test(error.message) ? "That time overlaps another class in this room." : error.message);
  revalidatePath(`/rooms/${p.data.roomId}/attendance`);
  return done("Class scheduled.");
});

export const enrollInClassAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  await adminSchool();
  const classId = z.string().uuid().parse(fd.get("classId"));
  const studentId = z.string().uuid().parse(fd.get("studentId"));
  const { error } = await createSupabaseServiceClient().from("class_enrollments").insert({ class_session_id: classId, student_id: studentId });
  if (error) return fail(error.code === "23505" ? "Already enrolled in this class." : error.message);
  revalidatePath("/attendance");
  return done("Student added to the class.");
});

// Atomic acknowledge: exactly one succeeds; others are told it was already acknowledged.
export const ackIncidentAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const user = await requireUser();
  const incidentId = z.string().uuid().parse(fd.get("incidentId"));
  // Visibility check through RLS: a caller who cannot see the incident cannot ack it.
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data: visible } = await supabase.from("security_incidents").select("id").eq("id", incidentId).maybeSingle();
  if (!visible) return fail("You do not have permission to do this.");
  const { data, error } = await createSupabaseServiceClient().rpc("ack_incident", { p_incident_id: incidentId, p_actor: user.id });
  if (error) return fail(error.message);
  revalidatePath("/incidents");
  return data ? done("Acknowledged.") : fail("Already acknowledged by someone else.");
});

export const unblockCardAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { userId } = await adminSchool();
  const { error } = await createSupabaseServiceClient().rpc("unblock_card", { p_block: z.string().uuid().parse(fd.get("blockId")), p_actor: userId });
  if (error) return fail(error.message);
  revalidatePath("/incidents");
  return done("Card unblocked.");
});
