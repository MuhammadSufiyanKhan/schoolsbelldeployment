import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import PrintButton from "@/components/print-button";
import { money } from "@/components/ui";

// Payslip. Row level security lets only the staff member themself, or people with payroll access, read it.
export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sb = await supabase();
  const { data: r } = await sb.from("payroll").select("month,base,absent_days,deductions,bonus,advance,eobi,tax,net,status,paid_on,staff(full_name,emp_no,designation),campuses(name)").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: school } = await sb.from("schools").select("name").maybeSingle();
  const st = r.staff as unknown as { full_name: string; emp_no: string; designation: string };
  const rows: [string, number, boolean][] = [["Basic salary", Number(r.base), false], [`Absence deduction (${r.absent_days} day${r.absent_days === 1 ? "" : "s"})`, -Number(r.deductions), true], ["Bonus", Number(r.bonus), false], ["Advance recovered", -Number(r.advance), true], ["EOBI", -Number(r.eobi), true], ["Income tax", -Number(r.tax), true]];
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-3 print:hidden"><PrintButton label="Print payslip" /></div>
      <div className="rounded-xl border border-line bg-card p-6 print:border-0">
        <div className="border-b-2 border-brand pb-2 text-center"><div className="text-lg font-bold">{school?.name}</div><div className="text-sm text-mute">Payslip · {r.month}</div></div>
        <dl className="my-4 grid grid-cols-2 gap-1 text-sm"><dt className="text-mute">Name</dt><dd className="font-medium">{st.full_name}</dd><dt className="text-mute">Employee no.</dt><dd>{st.emp_no}</dd><dt className="text-mute">Designation</dt><dd>{st.designation}</dd></dl>
        <table className="w-full text-sm"><tbody>{rows.filter(([, v]) => v !== 0 || false).map(([l, v]) => <tr key={l} className="border-b border-line"><td className="py-1.5">{l}</td><td className={`py-1.5 text-right ${v < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{v < 0 ? "− " : ""}{money(Math.abs(v))}</td></tr>)}
          <tr className="font-bold"><td className="pt-3">Net pay</td><td className="pt-3 text-right">{money(r.net)}</td></tr></tbody></table>
        <p className="mt-4 text-xs text-mute">{r.status === "paid" ? `Paid on ${r.paid_on}` : "Not yet paid"}</p>
      </div>
    </div>
  );
}
