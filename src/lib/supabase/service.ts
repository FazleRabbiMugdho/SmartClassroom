import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

// Service-role client: bypasses RLS. Server/worker only. Used for device ingestion,
// privileged RPCs (0007/0010) and onboarding. NEVER import from a client component.
export function createSupabaseServiceClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
