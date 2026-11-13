import { createSupabaseServerClient } from "@/lib/supabase/server";

// RLS-bound reads. What a caller can see is decided by the database.

export interface StudentRow { id: string; student_code: string; full_name: string; class_label: string | null; enrollment_status: string }
export interface AttendanceRow { id: string; attendance_status: string; check_in_at: string | null; entry_method: string; face_verified: boolean; class_session_id: string; student_id: string }
export interface ClassRow { id: string; title: string; starts_at: string; ends_at: string; room_id: string }

export async function listStudents(): Promise<StudentRow[]> {
  const s = await createSupabaseServerClient();
  const { data } = await s.from("students").select("id, student_code, full_name, class_label, enrollment_status").order("full_name");
  return (data ?? []) as StudentRow[];
}

export async function getStudent(id: string): Promise<StudentRow | null> {
  const s = await createSupabaseServerClient();
  const { data } = await s.from("students").select("id, student_code, full_name, class_label, enrollment_status").eq("id", id).maybeSingle();
  return (data as StudentRow | null) ?? null;
}

export async function getActiveCard(studentId: string): Promise<{ card_uid: string; registered_at: string } | null> {
  const s = await createSupabaseServerClient();
  const { data } = await s.from("student_cards").select("card_uid, registered_at").eq("student_id", studentId).eq("status", "ACTIVE").maybeSingle();
  return data ?? null;
}

export async function attendanceFor(studentIds?: string[]): Promise<(AttendanceRow & { class: { title: string; starts_at: string } | null })[]> {
  const s = await createSupabaseServerClient();
  let q = s.from("attendance_records")
    .select("id, attendance_status, check_in_at, entry_method, face_verified, class_session_id, student_id, class:class_sessions(title, starts_at)")
    .order("marked_at", { ascending: false }).limit(100);
  if (studentIds) q = q.in("student_id", studentIds);
  const { data } = await q;
  return (data ?? []) as unknown as (AttendanceRow & { class: { title: string; starts_at: string } | null })[];
}

/** Classes in a window around now (default: previous 24 h to next 24 h). */
export async function classesInWindow(roomId?: string, hoursBack = 24, hoursFwd = 24): Promise<(ClassRow & { room: { display_name: string } | null })[]> {
  const s = await createSupabaseServerClient();
  const now = Date.now();
  let q = s.from("class_sessions")
    .select("id, title, starts_at, ends_at, room_id, room:rooms(display_name)")
    .gte("starts_at", new Date(now - hoursBack * 3_600_000).toISOString())
    .lte("starts_at", new Date(now + hoursFwd * 3_600_000).toISOString())
    .order("starts_at", { ascending: false });
  if (roomId) q = q.eq("room_id", roomId);
  const { data } = await q;
  return (data ?? []) as unknown as (ClassRow & { room: { display_name: string } | null })[];
}
