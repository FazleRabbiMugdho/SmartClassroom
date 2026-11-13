"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, requireUser, AuthzError } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { parsePolygon, polygonArea } from "./geometry";
import type { ActionState } from "@/components/ui/ActionForm";

const fail = (message: string): ActionState => ({ ok: false, message });
const done = (message: string): ActionState => ({ ok: true, message });
const run = async (fn: () => Promise<ActionState>): Promise<ActionState> => {
  try { return await fn(); }
  catch (e) { return fail(e instanceof AuthzError ? "You do not have permission to do this." : e instanceof Error ? e.message : "Something went wrong."); }
};

// Admin saves the DOOR / ROOM reference snapshot. Stored privately; only its key is in the DB.
export const saveReferenceAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const { user } = await assertAdmin();
  const p = z.object({ roomId: z.string().uuid(), position: z.enum(["DOOR", "ROOM"]), width: z.coerce.number().int().min(16).max(8000), height: z.coerce.number().int().min(16).max(8000) })
    .safeParse({ roomId: fd.get("roomId"), position: fd.get("position"), width: fd.get("width"), height: fd.get("height") });
  if (!p.success) return fail("Choose DOOR or ROOM and a valid image.");
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0 || file.size > 2_000_000) return fail("Choose a JPEG under 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return fail("The reference snapshot must be a JPEG.");

  const key = `reference/${p.data.roomId}/${p.data.position}.jpg`;
  const svc = createSupabaseServiceClient();
  const up = await svc.storage.from("private-snapshots").upload(key, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) return fail(`Upload failed: ${up.error.message}`);
  const { error } = await svc.from("camera_positions").upsert({
    room_id: p.data.roomId, position: p.data.position, reference_object_key: key, reference_width: p.data.width, reference_height: p.data.height, saved_by: user.id, saved_at: new Date().toISOString(),
  }, { onConflict: "room_id,position" });
  if (error) return fail(error.message);
  revalidatePath(`/rooms/${p.data.roomId}/vision`);
  return done(`${p.data.position} reference saved.`);
});

const zonesInput = z.array(z.object({ seat_no: z.number().int().positive(), label: z.string().max(40).optional(), polygon: z.unknown() })).max(60);

export async function saveSeatZonesAction(roomId: string, zonesJson: string): Promise<ActionState> {
  return run(async () => {
    const { user } = await assertAdmin();
    z.string().uuid().parse(roomId);
    let raw: unknown;
    try { raw = JSON.parse(zonesJson); } catch { return fail("Zones could not be read."); }
    const zones = zonesInput.safeParse(raw);
    if (!zones.success) return fail("Zones are invalid.");
    if (zones.data.length < 2) return fail("Draw at least two seat zones.");

    const seen = new Set<number>();
    for (const z0 of zones.data) {
      const poly = parsePolygon(z0.polygon);
      if (!poly) return fail(`Seat ${z0.seat_no}: the zone must have at least 3 points inside the image.`);
      if (polygonArea(poly) < 0.002) return fail(`Seat ${z0.seat_no}: the zone is too small.`);
      if (seen.has(z0.seat_no)) return fail(`Seat number ${z0.seat_no} is used twice.`);
      seen.add(z0.seat_no);
    }

    const svc = createSupabaseServiceClient();
    const { data: ref } = await svc.from("camera_positions").select("reference_width, reference_height").eq("room_id", roomId).eq("position", "ROOM").maybeSingle();
    if (!ref) return fail("Save a ROOM reference snapshot first.");
    const { data, error } = await svc.rpc("replace_seat_zones", { p_room: roomId, p_zones: zones.data, p_width: ref.reference_width, p_height: ref.reference_height, p_actor: user.id });
    if (error) return fail(error.message);
    revalidatePath(`/rooms/${roomId}/vision`);
    return done(`Saved ${zones.data.length} zones (version ${data}).`);
  });
}

export const selectPositionAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const user = await requireUser();
  const p = z.object({ roomId: z.string().uuid(), position: z.enum(["DOOR", "ROOM"]) }).safeParse({ roomId: fd.get("roomId"), position: fd.get("position") });
  if (!p.success) return fail("Choose DOOR or ROOM.");
  const { error } = await createSupabaseServiceClient().rpc("select_camera_position", { p_room: p.data.roomId, p_position: p.data.position, p_actor: user.id });
  if (error) return fail(/no reference/.test(error.message) ? `Save a ${p.data.position} reference snapshot first.` : error.message);
  revalidatePath(`/rooms/${p.data.roomId}/vision`);
  return done(`${p.data.position} selected. Re-aim the camera by hand; it shows as confirmed when the device reports it.`);
});

export const setNightModeAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const user = await requireUser();
  const roomId = z.string().uuid().parse(fd.get("roomId"));
  const on = fd.get("on") === "true";
  const { error } = await createSupabaseServiceClient().rpc("set_night_mode", { p_room: roomId, p_on: on, p_actor: user.id });
  if (error) return fail(error.message);
  revalidatePath(`/rooms/${roomId}/vision`);
  return done(on ? "Night mode on." : "Night mode off.");
});

export const setCapacityAction = async (_p: ActionState, fd: FormData) => run(async () => {
  const { roles } = await assertAdmin();
  const roomId = z.string().uuid().parse(fd.get("roomId"));
  const raw = String(fd.get("capacity") ?? "").trim();
  const capacity = raw === "" ? null : z.coerce.number().int().min(1).max(500).safeParse(raw);
  if (capacity !== null && !capacity.success) return fail("Capacity must be a whole number from 1 to 500.");
  const svc = createSupabaseServiceClient();
  const { data: room } = await svc.from("rooms").select("school_id").eq("id", roomId).maybeSingle();
  if (!room || !roles.some((r) => r.role === "ADMIN" && r.school_id === room.school_id)) return fail("You do not have permission to do this.");
  const { error } = await svc.from("rooms").update({ capacity: capacity === null ? null : capacity.data, updated_at: new Date().toISOString() }).eq("id", roomId);
  if (error) return fail(error.message);
  revalidatePath(`/rooms/${roomId}/vision`);
  return done(capacity === null ? "Capacity cleared." : `Capacity set to ${capacity.data}.`);
});
