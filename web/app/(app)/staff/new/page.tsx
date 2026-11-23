import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guard, activeCampus } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { Card, PageHeader, str } from "@/components/ui";
import StaffForm from "../staff-form";

const ROLES = ["teacher", "hr", "accountant", "receptionist"];

async function create(fd: FormData) {
  "use server";
  const p = await guard("staff", "add");
  const campus = await activeCampus();
  const role = str(fd, "role"), email = str(fd, "email").toLowerCase();
  if (!campus || !ROLES.includes(role)) redirect("/staff?msg=Invalid+role+or+campus");
  const pw = randomBytes(9).toString("base64url") + "A1";   // temporary; the person must change it on first sign-in
  const db = admin();
  const created = await db.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (created.error || !created.data.user) redirect("/staff/new?msg=" + encodeURIComponent("Could not create the login: " + (created.error?.message ?? "unknown")));
  const uid = created.data!.user!.id;
  const undo = async () => { await db.auth.admin.deleteUser(uid); };
  const { error: pe } = await db.from("profiles").insert({ id: uid, school_id: p.school_id, campus_id: campus!.id, role, full_name: str(fd, "full_name"), must_change_password: true });
  if (pe) { await undo(); redirect("/staff/new?msg=" + encodeURIComponent(pe.message)); }
  const sb = await supabase();
  const { count } = await sb.from("staff").select("*", { count: "exact", head: true });
  let emp = `E-${String((count ?? 0) + 1).padStart(3, "0")}`;
  const row = { school_id: p.school_id, campus_id: campus!.id, user_id: uid, full_name: str(fd, "full_name"), designation: str(fd, "designation"), department: str(fd, "department"), phone: str(fd, "phone"), cnic: str(fd, "cnic"), address: str(fd, "address"), salary: Number(fd.get("salary") || 0), join_date: str(fd, "join_date") || null };
  let ins = await sb.from("staff").insert({ ...row, emp_no: emp }).select("id").single();
  if (ins.error?.code === "23505") { emp += "-" + Math.random().toString(36).slice(2, 5); ins = await sb.from("staff").insert({ ...row, emp_no: emp }).select("id").single(); }
  if (ins.error || !ins.data) { await db.from("profiles").delete().eq("id", uid); await undo(); redirect("/staff/new?msg=" + encodeURIComponent(ins.error?.message ?? "Could not save")); }
  // Show the temporary password once, on the next screen only. It is kept in a short-lived httpOnly cookie, not in the URL.
  (await cookies()).set("sw_tmp", JSON.stringify({ id: ins.data!.id, email, pw }), { httpOnly: true, sameSite: "lax", path: "/staff", maxAge: 120, secure: process.env.NODE_ENV === "production" });
  redirect(`/staff/${ins.data!.id}`);
}

export default async function NewStaff({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await guard("staff", "add");
  const sp = await searchParams;
  return (<><PageHeader title="Add staff member" />{sp.msg && <div className="mb-4 rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-700 dark:text-red-300">{sp.msg}</div>}<Card className="max-w-3xl"><StaffForm action={create} isNew /></Card></>);
}
