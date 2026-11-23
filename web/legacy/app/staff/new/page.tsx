import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { run, audit } from "@/lib/db";
import { ensureUser, nextNo, q } from "@/lib/util";
import type { Role } from "@/lib/perm";
import { Card, PageHeader, str, num } from "@/components/ui";
import StaffForm from "../staff-form";

async function create(fd: FormData) {
  "use server";
  const s = await guard("staff", true);
  const role = str(fd, "role") as Role;
  if (role === "admin" && s.role !== "admin") redirect("/staff?msg=Only+an+admin+can+create+admin+accounts");
  const u = ensureUser(str(fd, "email"), str(fd, "name"), role);
  const no = nextNo("staff", "emp_no", "E-");
  run("INSERT INTO staff(user_id,emp_no,name,designation,department,phone,cnic,address,salary,join_date) VALUES(?,?,?,?,?,?,?,?,?,?)", u.id, no, str(fd, "name"), str(fd, "designation"), str(fd, "department"), str(fd, "phone"), str(fd, "cnic"), str(fd, "address"), num(fd, "salary"), str(fd, "join_date"));
  audit(s.name, `added staff ${str(fd, "name")} (${role})`);
  redirect(`/staff?msg=${q(`Added ${no}.` + (u.password ? ` Login: ${str(fd, "email")} / ${u.password} (they should change it).` : " Existing login reused."))}`);
}
export default async function NewStaff() {
  await guard("staff", true);
  return (<><PageHeader title="Add staff member" /><Card className="max-w-3xl"><StaffForm action={create} isNew /></Card></>);
}
