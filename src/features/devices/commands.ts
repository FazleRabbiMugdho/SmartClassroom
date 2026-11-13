import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Allowlisted server->device command types (Part C6). No generic/unsafe commands.
export const COMMAND_TYPES = [
  "SET_THRESHOLDS",
  "FIRE_RESET",
  "TEACHER_TAG_OP",
  "WEATHER_NOTICE",
  "OTA_INSTALL",
  "CONFIG_SYNC",
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/**
 * Queue a command for a device. The caller must already have enforced role/safety
 * rules (e.g. FIRE_RESET is Teacher/Admin only and only after the device reports the
 * flame is gone — enforced in Prompt 08). Supersede of a prior in-flight command of
 * the same type happens in SQL (enqueue_command).
 */
export async function enqueueCommand(
  deviceId: string,
  type: CommandType,
  payload: Record<string, unknown>,
  actorId: string,
  ttlSeconds = 120,
): Promise<string> {
  if (!COMMAND_TYPES.includes(type)) throw new Error(`disallowed command type: ${type}`);
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("enqueue_command", {
    p_device: deviceId,
    p_type: type,
    p_payload: payload,
    p_actor: actorId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return data as string;
}
