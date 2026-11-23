import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client: BYPASSES row level security. Only for server code that has already checked who is asking
 *  (creating logins, confirming parent links). Never import this from a client component. */
export function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
