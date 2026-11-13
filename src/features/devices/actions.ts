"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, AuthzError } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/components/ui/ActionForm";

const fail = (message: string): ActionState => ({ ok: false, message });
const done = (message: string): ActionState => ({ ok: true, message });

function guard<T extends (...a: never[]) => Promise<ActionState>>(fn: T): T {
  return (async (...args: never[]) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthzError) return fail("Only Admins can do this.");
      return fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  }) as T;
}

// Level 5 validation, with messages that name the problem and the fix.
const limits = z.object({
  warning: z.coerce.number({ message: "Warning limit must be a number." }).min(0, "Warning limit must be at least 0 °C.").max(50, "Warning limit must be at most 50 °C."),
  danger: z.coerce.number({ message: "Danger limit must be a number." }).min(0, "Danger limit must be at least 0 °C.").max(50, "Danger limit must be at most 50 °C."),
}).refine((v) => v.warning < v.danger, { message: "Warning limit must be below the Danger limit.", path: ["warning"] });

export const changeThresholdsAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { user } = await assertAdmin();
  const deviceId = z.string().uuid().parse(fd.get("deviceId"));
  const parsed = limits.safeParse({ warning: fd.get("warning"), danger: fd.get("danger") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { error } = await createSupabaseServiceClient().rpc("change_thresholds", {
    p_device: deviceId, p_warning: parsed.data.warning, p_danger: parsed.data.danger, p_actor: user.id, p_reason: "dashboard",
  });
  if (error) return fail(error.message);
  revalidatePath(`/devices/${deviceId}/configuration`);
  return done("Saved. Sent to the device — waiting for it to confirm.");
});

const MAX_FIRMWARE_BYTES = 8 * 1024 * 1024;
const ESP_IMAGE_MAGIC = 0xe9;

// Firmware upload: private bucket, SHA-256 computed server-side, basic image sanity check.
// A damaged or deliberately faulty test image is still a valid upload; the device must reject
// or roll it back (Level 5), and only the device's events prove that.
export const uploadFirmwareAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { user } = await assertAdmin();
  const file = fd.get("file") as File | null;
  const version = String(fd.get("version") ?? "").trim();
  if (!/^\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/.test(version)) return fail("Version must look like 1.2.3.");
  if (!file || file.size === 0) return fail("Choose a firmware .bin file.");
  if (!file.name.toLowerCase().endsWith(".bin")) return fail("Firmware must be a .bin file.");
  if (file.size > MAX_FIRMWARE_BYTES) return fail("Firmware is larger than 8 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== ESP_IMAGE_MAGIC) return fail("This does not look like an ESP32 firmware image (bad magic byte).");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `releases/${version}-${sha256.slice(0, 12)}.bin`;

  const svc = createSupabaseServiceClient();
  const up = await svc.storage.from("firmware-ota").upload(key, bytes, { contentType: "application/octet-stream", upsert: false });
  if (up.error) return fail(`Upload failed: ${up.error.message}`);
  const { error } = await svc.from("ota_releases").insert({
    version, file_size_bytes: bytes.length, sha256, storage_object_key: key, uploaded_by: user.id,
  });
  if (error) {
    await svc.storage.from("firmware-ota").remove([key]); // do not leave an orphan object
    return fail(error.code === "23505" ? "That version already exists." : error.message);
  }
  revalidatePath("/devices", "layout");
  return done(`Uploaded ${version} (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…).`);
});

export const startOtaAction = guard(async (_p: ActionState, fd: FormData): Promise<ActionState> => {
  const { user } = await assertAdmin();
  const { error } = await createSupabaseServiceClient().rpc("start_ota_job", {
    p_release: z.string().uuid().parse(fd.get("releaseId")), p_device: z.string().uuid().parse(fd.get("deviceId")), p_actor: user.id,
  });
  if (error) return fail(/duplicate|unique/.test(error.message) ? "This device already has an update in progress." : error.message);
  revalidatePath(`/devices/${String(fd.get("deviceId"))}/ota`);
  return done("Update queued. The device will fetch it on its next poll.");
});
