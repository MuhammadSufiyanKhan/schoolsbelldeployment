import Link from "next/link";
import { redirect } from "next/navigation";
import { guard, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, Btn, Flash, money, thisMonth, str, first, type SP } from "@/components/ui";

// net = base − absence deduction (base ÷ 26 per absent day; approved leave is not absence) + bonus − advance − EOBI − income tax.
// EOBI and tax are entered by the accountant: rates change by year and by person, so they are not guessed here.
const netOf = (base: number, ded: number, bonus: number, adv: number, eobi: number, tax: number) => Math.max(0, base - ded + bonus - adv - eobi - tax);

async function generate(fd: FormData) {
  "use server";
  const p = await guard("payroll", "add");
  const month = str(fd, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/payroll?msg=Pick+a+month");
  const sb = await supabase();
  const campus = await scopeCampusId();
  let sq = sb.from("staff").select("id,campus_id,salary").eq("status", "active");
  if (campus) sq = sq.eq("campus_id", campus);
  const [{ data: staff }, { data: ab }] = await Promise.all([sq, sb.from("staff_attendance").select("staff_id").eq("status", "A").gte("date", month + "-01").lt("date", nextMonth(month) + "-01")]);
  const absent = new Map<string, number>();
  for (const a of ab ?? []) absent.set(a.staff_id, (absent.get(a.staff_id) ?? 0) + 1);
  const rows = (staff ?? []).map((s) => { const base = Number(s.salary), days = absent.get(s.id) ?? 0, ded = Math.round((base / 26) * days);
    return { school_id: p.school_id, campus_id: s.campus_id, staff_id: s.id, month, base, absent_days: days, deductions: ded, net: netOf(base, ded, 0, 0, 0, 0) }; });
  const { error } = await sb.from("payroll").upsert(rows, { onConflict: "staff_id,month", ignoreDuplicates: true });
  redirect(`/payroll?month=${month}&msg=${error ? encodeURIComponent(error.message) : "Payslips+prepared+for+" + rows.length + "+staff"}`);
}
function nextMonth(m: string) { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; }
async function adjust(fd: FormData) {
  "use server";
  await guard("payroll", "edit");
  const sb = await supabase();
  const id = str(fd, "id");
  const { data: r } = await sb.from("payroll").select("base,deductions,month,status").eq("id", id).maybeSingle();
  if (!r) redirect("/payroll");
  if (r.status === "paid") redirect(`/payroll?month=${r.month}&msg=Already+paid`);
  const n = (k: string) => Math.max(0, Number(fd.get(k) || 0));
  await sb.from("payroll").update({ bonus: n("bonus"), advance: n("advance"), eobi: n("eobi"), tax: n("tax"), net: netOf(Number(r.base), Number(r.deductions), n("bonus"), n("advance"), n("eobi"), n("tax")) }).eq("id", id);
  redirect(`/payroll?month=${r.month}&msg=Updated`);
}
async function pay(fd: FormData) {
  "use server";
  await guard("payroll", "edit");
  const sb = await supabase();
  const { data: r } = await sb.from("payroll").update({ status: "paid", paid_on: new Date().toISOString().slice(0, 10) }).eq("id", str(fd, "id")).select("month").maybeSingle();
  redirect(`/payroll?month=${r?.month ?? ""}&msg=Marked+paid`);
}

export default async function Payroll({ searchParams }: { searchParams: SP }) {
  await guard("payroll");
  const sp = await searchParams;
  const month = first(sp.month) || thisMonth();
  const sb = await supabase();
  const campus = await scopeCampusId();
  let q = sb.from("payroll").select("id,base,absent_days,deductions,bonus,advance,eobi,tax,net,status,paid_on,staff(full_name)").eq("month", month);
  if (campus) q = q.eq("campus_id", campus);
  const rows = ((await q).data ?? []) as unknown as { id: string; base: number; absent_days: number; deductions: number; bonus: number; advance: number; eobi: number; tax: number; net: number; status: string; paid_on: string; staff: { full_name: string } }[];
  const total = rows.reduce((a, r) => a + Number(r.net), 0);
  const [canAdd, canEdit] = await Promise.all([can("payroll", "add"), can("payroll", "edit")]);
  return (
    <>
      <PageHeader title="Payroll" sub={`${rows.length} payslips · total ${money(total)}`} />
      <Flash msg={first(sp.msg)} />
      <Card className="mb-4"><form className="flex flex-wrap items-end gap-2"><input type="month" name="month" defaultValue={month} className="max-w-[12rem]" /><button className="rounded-lg border border-line px-4 py-2 text-sm">View</button>
        {canAdd && <button formAction={generate} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Prepare payslips for month</button>}</form></Card>
      <Card><Table head={["Staff", "Base", "Absent", "Deduction", "Bonus", "Advance", "EOBI", "Tax", "Net", "Status", ""]} empty={rows.length ? undefined : "No payslips for this month yet."}>
        {rows.map((r) => { const open = canEdit && r.status !== "paid"; return (
          <tr key={r.id}><td className="font-medium"><Link className="hover:underline" href={`/payroll/${r.id}`}>{r.staff?.full_name}</Link></td><td>{money(r.base)}</td><td>{r.absent_days}</td><td>{money(r.deductions)}</td>
            {open ? <td colSpan={4}><form action={adjust} className="flex gap-1"><input type="hidden" name="id" value={r.id} />{(["bonus", "advance", "eobi", "tax"] as const).map((k) => <input key={k} type="number" min={0} name={k} defaultValue={r[k]} title={k} className="!w-20 !px-1 !py-1 text-xs" />)}<Btn variant="ghost" className="!px-2 !py-1 text-xs">Set</Btn></form></td>
              : <><td>{money(r.bonus)}</td><td>{money(r.advance)}</td><td>{money(r.eobi)}</td><td>{money(r.tax)}</td></>}
            <td className="font-semibold">{money(r.net)}</td><td><Badge tone={r.status === "paid" ? "ok" : "warn"}>{r.status === "paid" ? "Paid " + r.paid_on : "Unpaid"}</Badge></td>
            <td>{open && <form action={pay}><input type="hidden" name="id" value={r.id} /><Btn className="!px-2 !py-1 text-xs">Mark paid</Btn></form>}</td></tr>); })}
      </Table></Card>
    </>
  );
}
