import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run, audit } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Table, Badge, Btn, Flash, money, thisMonth, str, num, first, type SP } from "@/components/ui";

// Net = base − (absent days × base/26) + bonus. Approved leave is not deducted.
async function generate(fd: FormData) {
  "use server";
  const s = await guard("payroll", true);
  const month = str(fd, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/payroll?err=Pick+a+month");
  let n = 0;
  for (const st of all<{ id: number; salary: number }>("SELECT id,salary FROM staff WHERE status='active'")) {
    if (one("SELECT 1 FROM payroll WHERE staff_id=? AND month=?", st.id, month)) continue;
    const absent = one<{ c: number }>("SELECT COUNT(*) c FROM staff_attendance WHERE staff_id=? AND status='A' AND date LIKE ?", st.id, month + "%")!.c;
    const ded = Math.round((st.salary / 26) * absent);
    run("INSERT INTO payroll(staff_id,month,base,deductions,net) VALUES(?,?,?,?,?)", st.id, month, st.salary, ded, st.salary - ded);
    n++;
  }
  audit(s.name, `generated payroll ${month} (${n})`);
  redirect(`/payroll?month=${month}&msg=Generated+${n}+payslips`);
}
async function adjust(fd: FormData) {
  "use server";
  await guard("payroll", true);
  const id = num(fd, "id"), bonus = num(fd, "bonus");
  const p = one<{ base: number; deductions: number; month: string; status: string }>("SELECT * FROM payroll WHERE id=?", id)!;
  if (p.status === "paid") redirect(`/payroll?month=${p.month}&err=Already+paid`);
  run("UPDATE payroll SET bonus=?, net=? WHERE id=?", bonus, p.base - p.deductions + bonus, id);
  redirect(`/payroll?month=${p.month}`);
}
async function pay(fd: FormData) {
  "use server";
  const s = await guard("payroll", true);
  const id = num(fd, "id");
  run("UPDATE payroll SET status='paid', paid_on=? WHERE id=?", new Date().toISOString().slice(0, 10), id);
  const p = one<{ month: string }>("SELECT month FROM payroll WHERE id=?", id)!;
  audit(s.name, `paid payroll #${id}`);
  redirect(`/payroll?month=${p.month}&msg=Marked+paid`);
}

export default async function Payroll({ searchParams }: { searchParams: SP }) {
  const s = await guard("payroll");
  const sp = await searchParams;
  const month = first(sp.month) || thisMonth();
  const rows = all<{ id: number; name: string; base: number; deductions: number; bonus: number; net: number; status: string; paid_on: string }>("SELECT p.*, s.name FROM payroll p JOIN staff s ON s.id=p.staff_id WHERE month=? ORDER BY s.name", month);
  const total = rows.reduce((a, r) => a + r.net, 0);
  const w = can(s.role, "payroll", true);
  return (
    <>
      <PageHeader title="Payroll" sub={`${rows.length} payslips · total ${money(total)}`} />
      <Flash msg={first(sp.msg)} err={first(sp.err)} />
      <Card className="mb-4"><form className="flex flex-wrap items-end gap-2"><input type="month" name="month" defaultValue={month} className="max-w-[12rem]" /><button className="rounded-lg border border-line px-4 py-2 text-sm">View</button>
        {w && <button formAction={generate} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Generate payroll for month</button>}</form></Card>
      <Card><Table head={["Staff", "Base", "Absence deduction", "Bonus", "Net", "Status", ""]} empty={rows.length ? undefined : "No payroll for this month yet."}>
        {rows.map((r) => <tr key={r.id}><td className="font-medium">{r.name}</td><td>{money(r.base)}</td><td>{money(r.deductions)}</td>
          <td>{w && r.status !== "paid" ? <form action={adjust} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><input type="number" name="bonus" defaultValue={r.bonus} className="w-24" /><Btn variant="ghost" className="!px-2 !py-1 text-xs">Set</Btn></form> : money(r.bonus)}</td>
          <td className="font-semibold">{money(r.net)}</td><td><Badge tone={r.status === "paid" ? "ok" : "warn"}>{r.status === "paid" ? "Paid " + r.paid_on : "Unpaid"}</Badge></td>
          <td>{w && r.status !== "paid" && <form action={pay}><input type="hidden" name="id" value={r.id} /><Btn className="!px-2 !py-1 text-xs">Mark paid</Btn></form>}</td></tr>)}
      </Table></Card>
    </>
  );
}
