import { redirect } from "next/navigation";
import { guard, activeCampus } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, str } from "@/components/ui";
import StudentForm from "../student-form";

async function create(fd: FormData) {
  "use server";
  const p = await guard("students", "add");
  const campus = await activeCampus();
  if (!campus) redirect("/students?msg=No+campus+available");
  const sb = await supabase();
  const { count } = await sb.from("students").select("*", { count: "exact", head: true });
  const row = {
    school_id: p.school_id, campus_id: campus.id, class_id: str(fd, "class_id"), full_name: str(fd, "full_name"), gender: str(fd, "gender"),
    dob: str(fd, "dob") || null, guardian_name: str(fd, "guardian_name"), guardian_phone: str(fd, "guardian_phone"),
    guardian_email: str(fd, "guardian_email").toLowerCase() || null, address: str(fd, "address"),
  };
  let no = `A-${String((count ?? 0) + 1).padStart(3, "0")}`;
  let { error } = await sb.from("students").insert({ ...row, admission_no: no, roll_no: no });
  if (error?.code === "23505") { no += "-" + Math.random().toString(36).slice(2, 5); ({ error } = await sb.from("students").insert({ ...row, admission_no: no, roll_no: no })); }
  if (error) redirect("/students?msg=" + encodeURIComponent("Could not add student: " + error.message));
  redirect(`/students?msg=${encodeURIComponent("Student added as " + no)}`);
}

export default async function NewStudent() {
  await guard("students", "add");
  const sb = await supabase();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section");
  return (<><PageHeader title="Add student" /><Card className="max-w-3xl"><StudentForm action={create} isNew classes={classes ?? []} /></Card></>);
}
