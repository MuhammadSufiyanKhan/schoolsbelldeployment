import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { money } from "@/components/ui";
import Print from "./print";

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile(); // RLS decides whether this person may see this payment (staff with fees access, or the child's confirmed parent)
  const { id } = await params;
  const sb = await supabase();
  const { data: p } = await sb.from("payments").select("receipt_no,amount,method,paid_on,voided_at,challans(month,students(full_name,admission_no))").eq("id", id).maybeSingle();
  if (!p) notFound();
  const { data: school } = await sb.from("schools").select("name").maybeSingle();
  const ch = p.challans as unknown as { month: string; students: { full_name: string; admission_no: string } };
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-card p-6">
      <div className="text-center"><div className="text-lg font-bold">{school?.name}</div><div className="text-sm text-mute">Fee receipt · {p.receipt_no}{p.voided_at && " · VOIDED"}</div></div>
      <dl className="my-5 grid grid-cols-2 gap-2 text-sm"><dt className="text-mute">Student</dt><dd>{ch.students.full_name} ({ch.students.admission_no})</dd><dt className="text-mute">For month</dt><dd>{ch.month}</dd><dt className="text-mute">Date</dt><dd>{p.paid_on}</dd><dt className="text-mute">Method</dt><dd>{p.method}</dd><dt className="font-semibold">Amount</dt><dd className="font-semibold">{money(p.amount)}</dd></dl>
      <Print />
    </div>
  );
}
