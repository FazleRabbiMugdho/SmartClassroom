import { randomBytes } from "node:crypto";
import { sha256 } from "@/lib/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// High-entropy per-device token. Revealed once; only the hash is stored.
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface ProvisionInput {
  schoolId: string;
  deviceCode: string; // wire device_id, e.g. T07-D1
  teamCode: string; // e.g. T07
  roomId: string;
  actorId: string;
}

/** Create a device and reveal its raw token exactly once. */
export async function provisionDevice(input: ProvisionInput): Promise<{ deviceId: string; token: string }> {
  const token = generateDeviceToken();
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("provision_device", {
    p_school: input.schoolId,
    p_device_code: input.deviceCode,
    p_team_code: input.teamCode,
    p_room: input.roomId,
    p_token_hash: sha256(token),
    p_actor: input.actorId,
  });
  if (error) throw error;
  return { deviceId: data as string, token };
}

/** Rotate the active token and reveal the new raw token once. */
export async function rotateDeviceToken(deviceId: string, actorId: string): Promise<{ token: string }> {
  const token = generateDeviceToken();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("rotate_device_token", {
    p_device: deviceId,
    p_new_hash: sha256(token),
    p_actor: actorId,
  });
  if (error) throw error;
  return { token };
}

export async function revokeDeviceToken(deviceId: string, actorId: string, reason: string): Promise<void> {
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("revoke_device_token", {
    p_device: deviceId,
    p_actor: actorId,
    p_reason: reason,
  });
  if (error) throw error;
}
