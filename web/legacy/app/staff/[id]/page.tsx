import { notFound, redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run, audit } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Btn, Table, Badge, money, str, num, first, Flash, type SP } from "@/components/ui";
import StaffForm from "../staff-form";

async function save(id: number, fd: FormData) {
  "use server";
  const s = await guard("staff", true);
  run("UPDATE staff SET name=?,designation=?,department=?,phone=?,cnic=?,address=?,salary=?,join_date=?,status=? WHERE id=?", str(fd, "name"), str(fd, "designation"), str(fd, "department"), str(fd, "phone"), str(fd, "cnic"), str(fd, "address"), num(fd, "salary"), str(fd, "join_date"), str(fd, "status"), id);
  audit(s.name, `edited staff #${id}`);
  redirect(`/staff/${id}?msg=Saved`);
}
async function remove(id: number) {
  "use server";
  const s = await guard("staff", true);
  const st = one<{ user_id: number }>("SELECT user_id FROM staff WHERE id=?", id);
  if (st?.user_id && st.user_id === s.uid) redirect(`/staff/${id}?msg=You+cannot+delete+your+own+record`);
  run("UPDATE classes SET teacher_id=NULL WHERE teacher_id=?", id);
  run("UPDATE subjects SET teacher_id=NULL WHERE teacher_id=?", id);
  for (const t of ["staff_attendance", "leaves", "payroll"]) run(`DELETE FROM ${t} WHERE staff_id=?`, id);
  run("DELETE FROM staff WHERE id=?", id);
  if (st?.user_id) run("DELETE FROM users WHERE id=?", st.user_id);
  audit(s.name, `deleted staff #${id}`);
  redirect("/staff?msg=Staff+member+deleted");
}

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const s = await guard("staff");
  const { id } = await params;
  const sp = await searchParams;
  const st = one<{ id: number; emp_no: string; name: string; designation: string; department: string; phone: string; cnic: string; address: string; salary: number; join_date: string; status: string }>("SELECT * FROM staff WHERE id=?", Number(id));
  if (!st) notFound();
  const att = all<{ status: string; c: number }>("SELECT status, COUNT(*) c FROM staff_attendance WHERE staff_id=? AND date LIKE ? GROUP BY status", st.id, new Date().toISOString().slice(0, 7) + "%");
  const leaves = all<{ id: number; from_date: string; to_date: string; kind: string; status: string }>("SELECT * FROM leaves WHERE staff_id=? ORDER BY id DESC LIMIT 5", st.id);
  const pay = all<{ month: string; net: number; status: string }>("SELECT month,net,status FROM payroll WHERE staff_id=? ORDER BY month DESC LIMIT 6", st.id);
  const w = can(s.role, "staff", true);
  return (
    <>
      <PageHeader title={st.name} sub={`${st.emp_no} · ${st.designation}`}>{w && <form action={remove.bind(null, st.id)}><Btn variant="danger">Delete</Btn></form>}</PageHeader>
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>{w ? <StaffForm action={save.bind(null, st.id)} s={st} /> : <p className="text-sm text-mute">View only.</p>}</Card>
        <div className="space-y-4">
          <Card><h2 className="mb-2 font-semibold">This month</h2><div className="flex flex-wrap gap-2">{att.length ? att.map((a) => <Badge key={a.status} tone={a.status === "P" ? "ok" : a.status === "A" ? "bad" : "warn"}>{{ P: "Present", A: "Absent", L: "Leave" }[a.status] ?? a.status}: {a.c}</Badge>) : <span className="text-sm text-mute">No attendance yet</span>}</div></Card>
          {can(s.role, "leave") && <Card><h2 className="mb-2 font-semibold">Recent leave</h2>{leaves.length ? leaves.map((l) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{l.from_date} → {l.to_date} ({l.kind})</span><Badge tone={l.status === "approved" ? "ok" : l.status === "pending" ? "warn" : "bad"}>{l.status}</Badge></div>) : <span className="text-sm text-mute">None</span>}</Card>}
          {can(s.role, "payroll") && <Card><h2 className="mb-2 font-semibold">Payroll</h2><Table head={["Month", "Net", "Status"]}>{pay.map((p) => <tr key={p.month}><td>{p.month}</td><td>{money(p.net)}</td><td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{p.status}</Badge></td></tr>)}</Table></Card>}
        </div>
      </div>
    </>
  );
}
