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
    const sb = await supabase();
    // Detail screens that hold forms people need offline (marks entry, editing a student...). Row level security limits each list to what this person may see.
    const [exams, students, admissions, staff] = await Promise.all([
      view("exams") ? sb.from("exams").select("id").order("exam_date", { ascending: false }).limit(25) : null,
      view("students") ? sb.from("students").select("id").order("created_at", { ascending: false }).limit(40) : null,
      view("admissions") ? sb.from("admissions").select("id").not("stage", "in", "(enrolled,rejected)").order("created_at", { ascending: false }).limit(30) : null,
      view("staff") ? sb.from("staff").select("id").order("created_at", { ascending: false }).limit(30) : null,
    ]);
    for (const e of exams?.data ?? []) { urls.add(`/exams/${e.id}`); if (add("exams")) urls.add(`/exams/${e.id}/remarks`); }
    for (const x of students?.data ?? []) urls.add(`/students/${x.id}`);
    for (const x of admissions?.data ?? []) urls.add(`/admissions/${x.id}`);
    for (const x of staff?.data ?? []) urls.add(`/staff/${x.id}`);
    if (add("students")) urls.add("/students/new");
    if (add("staff")) urls.add("/staff/new");
    if (view("leave")) urls.add("/leave");
    if (view("staff_attendance")) urls.add("/staff-attendance");
    if (view("attendance")) {
      const { data } = await sb.from("classes").select("id").limit(40);   // row level security: teachers only get their own classes
      for (const c of data ?? []) urls.add(`/attendance?class_id=${c.id}`);
    }
  }
  return NextResponse.json({ urls: [...urls].slice(0, 160) }, { headers: { "Cache-Control": "no-store" } });
}
