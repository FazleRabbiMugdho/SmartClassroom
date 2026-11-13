import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

// Request-scoped Supabase client bound to the user's session cookies (RLS applies).
// Next 15: cookies() is async.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(serverEnv.supabaseUrl, serverEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll called from a Server Component: ignore; middleware refreshes the session.
        }
      },
    },
  });
}
