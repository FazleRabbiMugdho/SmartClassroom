import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Refresh the Supabase session on every request and keep auth cookies in sync.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No Supabase configured (e.g. local without env): skip, do not crash the app.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return response;

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static assets and the device API (device auth is token-based, not cookies).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/device).*)"],
};
