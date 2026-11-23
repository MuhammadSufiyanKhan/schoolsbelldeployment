import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/join", "/manifest.webmanifest", "/sw.js", "/icon.svg"];

// Refreshes the Supabase session cookie on every request and sends visitors without a session to /login.
// Per-role authorization happens in each page/action (lib/auth.ts) and again in the database (RLS).
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  // getClaims() checks the token signature locally (and refreshes it when it has expired) instead of calling Supabase Auth on every request.
  const { data } = await sb.auth.getClaims();
  const user = data?.claims;
  const path = req.nextUrl.pathname;
  if (!user && !PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.redirect(new URL("/login", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
