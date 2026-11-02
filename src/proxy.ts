import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie before staff and auth pages render (Server Components can't
 * write cookies). Authorization does not happen here; pages and actions check the session
 * themselves through src/server/auth/session.ts.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Keeps CDNs from caching a response that carries someone's session cookie.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/app/:path*",
    "/login",
    "/signup/:path*",
    "/forgot-password",
    "/reset-password",
    "/onboarding",
    "/invite/:path*",
    "/auth/:path*",
  ],
};
