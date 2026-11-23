import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run, audit } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Table, Badge, Btn, Field, Flash, str, num, first, type SP } from "@/components/ui";

async function apply(fd: FormData) {
  "use server";
  const s = await guard("leave");
  const me = one<{ id: number }>("SELECT id FROM staff WHERE user_id=?", s.uid);
  if (!me) redirect("/leave?err=Your+account+is+not+linked+to+a+staff+record");
  const from = str(fd, "from"), to = str(fd, "to");
  if (!from || !to || to < from) redirect("/leave?err=Check+the+dates");
  run("INSERT INTO leaves(staff_id,from_date,to_date,kind,reason) VALUES(?,?,?,?,?)", me.id, from, to, str(fd, "kind"), str(fd, "reason"));
  redirect("/leave?msg=Leave+request+sent");
}
async function decide(fd: FormData) {
  "use server";
  const s = await guard("leave", true);
  if (s.role !== "admin" && s.role !== "hr") redirect("/leave");
  const status = str(fd, "status") === "approved" ? "approved" : "rejected";
  const id = num(fd, "id");
  run("UPDATE leaves SET status=?, decided_by=? WHERE id=?", status, s.name, id);
  if (status === "approved") {
    const l = one<{ staff_id: number; from_date: string; to_date: string }>("SELECT * FROM leaves WHERE id=?", id)!;
    for (let d = new Date(l.from_date); d <= new Date(l.to_date); d.setDate(d.getDate() + 1))
      run("INSERT INTO staff_attendance(staff_id,date,status) VALUES(?,?,'L') ON CONFLICT(staff_id,date) DO UPDATE SET status='L'", l.staff_id, d.toISOString().slice(0, 10));
  }
  audit(s.name, `${status} leave #${id}`);
  redirect("/leave?msg=Leave+" + status);
}

export default async function Leave({ searchParams }: { searchParams: SP }) {
  const s = await guard("leave");
  const sp = await searchParams;
  const manager = s.role === "admin" || s.role === "hr";
  const me = one<{ id: number }>("SELECT id FROM staff WHERE user_id=?", s.uid);
  const rows = all<{ id: number; name: string; from_date: string; to_date: string; kind: string; reason: string; status: string; decided_by: string }>(
    `SELECT l.*, s.name FROM leaves l JOIN staff s ON s.id=l.staff_id ${manager ? "" : "WHERE l.staff_id=" + Number(me?.id ?? 0)} ORDER BY (l.status='pending') DESC, l.id DESC`);
  return (
    <>
      <PageHeader title="Leave" sub={manager ? "Approve or reject staff leave" : "Your leave requests"} />
      <Flash msg={first(sp.msg)} err={first(sp.err)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {me && <Card><h2 className="mb-3 font-semibold">Apply for leave</h2>
          <form action={apply} className="space-y-3">
            <Field label="From"><input type="date" name="from" required /></Field><Field label="To"><input type="date" name="to" required /></Field>
            <Field label="Type"><select name="kind"><option>casual</option><option>sick</option><option>annual</option><option>unpaid</option></select></Field>
            <Field label="Reason"><textarea name="reason" rows={2} /></Field><Btn>Submit</Btn></form></Card>}
        <Card className={me ? "" : "lg:col-span-2"}><Table head={["Staff", "Dates", "Type", "Reason", "Status", ""]} empty={rows.length ? undefined : "No leave requests."}>
          {rows.map((r) => <tr key={r.id}><td>{r.name}</td><td className="whitespace-nowrap">{r.from_date} → {r.to_date}</td><td>{r.kind}</td><td>{r.reason}</td>
            <td><Badge tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "bad"}>{r.status}</Badge></td>
            <td>{manager && r.status === "pending" && <form action={decide} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><button name="status" value="approved" className="rounded bg-teal-600 px-2 py-1 text-xs text-white">Approve</button><button name="status" value="rejected" className="rounded bg-red-600 px-2 py-1 text-xs text-white">Reject</button></form>}</td></tr>)}
        </Table></Card>
      </div>
      {!can(s.role, "leave", true) && null}
    </>
  );
}
