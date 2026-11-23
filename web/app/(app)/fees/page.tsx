import { redirect } from "next/navigation";
import Link from "next/link";
import { guard, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, Btn, Flash, Stat, Grid, money, thisMonth, str, first, type SP } from "@/components/ui";

async function generate(fd: FormData) {
  "use server";
  const p = await guard("fees", "add");
  const month = str(fd, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/fees?err=Pick+a+month");
  const sb = await supabase();
  const { data: studs } = await sb.from("students").select("id,campus_id,classes(monthly_fee)").eq("status", "active");
  const rows = ((studs ?? []) as unknown as { id: string; campus_id: string; classes: { monthly_fee: number } | null }[])
    .filter((s) => Number(s.classes?.monthly_fee) > 0)
    .map((s) => ({ school_id: p.school_id, campus_id: s.campus_id, student_id: s.id, month, amount: s.classes!.monthly_fee }));
  const { error } = await sb.from("challans").upsert(rows, { onConflict: "student_id,month", ignoreDuplicates: true });
  redirect(`/fees?month=${month}&${error ? "err=" + encodeURIComponent(error.message) : "msg=Challans+generated+for+" + rows.length + "+students"}`);
}
async function receive(fd: FormData) {
  "use server";
  const p = await guard("fees", "add");
  const sb = await supabase();
  const id = str(fd, "challan_id");
  const { data: ch } = await sb.from("challans").select("amount,discount,month,campus_id,payments(amount,voided_at)").eq("id", id).maybeSingle();
  if (!ch) redirect("/fees");
  const paid = (ch.payments as { amount: number; voided_at: string | null }[]).filter((x) => !x.voided_at).reduce((a, x) => a + Number(x.amount), 0);
  const amt = Math.min(Number(fd.get("amount") || 0), Number(ch.amount) - Number(ch.discount) - paid);
  if (!(amt > 0)) redirect(`/fees?month=${ch.month}&err=Nothing+to+collect`);
  const { data: pay, error } = await sb.from("payments").insert({
    school_id: p.school_id, campus_id: ch.campus_id, challan_id: id, amount: amt, method: str(fd, "method"), receipt_no: "R-" + Date.now().toString(36).toUpperCase(), received_by: p.id,
  }).select("id").single();
  if (error || !pay) redirect(`/fees?month=${ch.month}&err=${encodeURIComponent(error?.message ?? "failed")}`);
  redirect(`/fees/receipt/${pay.id}`);
}
async function voidPayment(fd: FormData) {
  "use server";
  await guard("fees", "approve");
  const reason = str(fd, "reason");
  if (!reason) redirect("/fees?err=A+reason+is+required+to+void+a+payment");
  await (await supabase()).from("payments").update({ voided_at: new Date().toISOString(), void_reason: reason }).eq("id", str(fd, "payment_id"));
  redirect("/fees?msg=Payment+voided");
}

type Row = { id: string; amount: number; discount: number; students: { full_name: string; classes: { name: string; section: string } | null } | null; payments: { id: string; amount: number; voided_at: string | null; receipt_no: string }[] };
export default async function Fees({ searchParams }: { searchParams: SP }) {
  await guard("fees");
  const sp = await searchParams;
  const month = first(sp.month) || thisMonth();
  const only = first(sp.only);
  const sb = await supabase();
  const campus = await scopeCampusId();
  let q = sb.from("challans").select("id,amount,discount,students(full_name,classes(name,section)),payments(id,amount,voided_at,receipt_no)").eq("month", month);
  if (campus) q = q.eq("campus_id", campus);
  const rows = (((await q).data ?? []) as unknown as Row[]).map((r) => {
    const bill = Number(r.amount) - Number(r.discount);
    const paid = r.payments.filter((x) => !x.voided_at).reduce((a, x) => a + Number(x.amount), 0);
    return { ...r, bill, paid };
  }).filter((r) => (only === "due" ? r.paid < r.bill : true));
  const billed = rows.reduce((a, r) => a + r.bill, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
  const canAdd = await can("fees", "add"), canVoid = await can("fees", "approve");
  return (
    <>
      <PageHeader title="Fees" sub={`Challans for ${month}`} />
      <Flash msg={first(sp.msg)} err={first(sp.err)} />
      <Grid cols={3}><Stat label="Billed" value={money(billed)} /><Stat label="Collected" value={money(paid)} /><Stat label="Outstanding" value={money(billed - paid)} /></Grid>
      <Card className="my-4"><form className="flex flex-wrap items-end gap-2"><input type="month" name="month" defaultValue={month} className="max-w-[12rem]" />
        <select name="only" defaultValue={only ?? ""} className="max-w-[10rem]"><option value="">All</option><option value="due">Unpaid / partial</option></select>
        <button className="rounded-lg border border-line px-4 py-2 text-sm">View</button>
        {canAdd && <button formAction={generate} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Generate challans for month</button>}</form></Card>
      <Card><Table head={["Student", "Class", "Billed", "Paid", "Status", "Collect / receipts"]} empty={rows.length ? undefined : "No challans. Generate them for this month."}>
        {rows.map((r) => { const due = r.bill - r.paid; return <tr key={r.id}><td className="font-medium">{r.students?.full_name}</td><td>{r.students?.classes ? `${r.students.classes.name}-${r.students.classes.section}` : "—"}</td><td>{money(r.bill)}</td><td>{money(r.paid)}</td>
          <td><Badge tone={due <= 0 ? "ok" : r.paid ? "warn" : "bad"}>{due <= 0 ? "Paid" : money(due) + " due"}</Badge></td>
          <td><div className="space-y-1">
            {canAdd && due > 0 && <form action={receive} className="flex gap-1"><input type="hidden" name="challan_id" value={r.id} /><input type="number" name="amount" defaultValue={due} min={1} max={due} className="!w-24" /><select name="method" className="!w-24"><option>cash</option><option>bank</option><option>online</option></select><Btn className="!px-2 !py-1 text-xs">Receive</Btn></form>}
            {r.payments.filter((x) => !x.voided_at).map((x) => <div key={x.id} className="flex items-center gap-2 text-xs"><Link className="text-brand underline" href={`/fees/receipt/${x.id}`}>{x.receipt_no}</Link>{money(x.amount)}
              {canVoid && <form action={voidPayment} className="flex gap-1"><input type="hidden" name="payment_id" value={x.id} /><input name="reason" placeholder="Reason to void" required className="!w-32 !py-0.5 text-xs" /><button className="text-red-600">void</button></form>}</div>)}</div></td></tr>; })}</Table></Card>
    </>
  );
}
