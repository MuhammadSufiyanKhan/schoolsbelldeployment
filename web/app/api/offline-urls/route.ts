import { NextResponse } from "next/server";
import { getProfile, getPerms } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { NAV, isFamily } from "@/lib/perm";

// Which screens this person may use. The app saves them on the device after sign-in so the whole interface opens without internet.
// It only lists addresses: what each page shows is still decided by the server and row level security when the page is fetched.
export async function GET() {
  const p = await getProfile();
  if (!p) return NextResponse.json({ urls: [] }, { status: 401 });
  const perms = await getPerms();
  const view = (m: string) => p.role === "super_admin" || perms.has(`${m}:view`);
  const add = (m: string) => p.role === "super_admin" || perms.has(`${m}:add`);
  const family = isFamily(p.role);
  const urls = new Set<string>(["/account"]);
  for (const n of NAV) {
    if (n.roles && !n.roles.includes(p.role)) continue;
    if (n.family ? !family : n.staffOnly ? family : n.mod ? !view(n.mod) : false) continue;
    urls.add(n.href);
  }
  if (!family) {
    if (add("students")) urls.add("/students/new");
    if (add("staff")) urls.add("/staff/new");
    if (view("leave")) urls.add("/leave");
    if (view("staff_attendance")) urls.add("/staff-attendance");
    if (view("attendance")) {
      const { data } = await (await supabase()).from("classes").select("id").limit(40);   // row level security: teachers only get their own classes
      for (const c of data ?? []) urls.add(`/attendance?class_id=${c.id}`);
    }
  }
  return NextResponse.json({ urls: [...urls].slice(0, 60) }, { headers: { "Cache-Control": "no-store" } });
}
