import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, money, str, first, Flash, type SP } from "@/components/ui";
import StaffForm from "../staff-form";
import ClearTemp from "@/components/clear-temp";

async function clearTmp() {
  "use server";
  (await cookies()).delete({ name: "sw_tmp", path: "/staff" });   // must match the path it was set with
}

async function save(id: string, fd: FormData) {
  "use server";
  await guard("staff", "edit");
  const patch: Record<string, unknown> = { full_name: str(fd, "full_name"), designation: str(fd, "designation"), department: str(fd, "department"), phone: str(fd, "phone"), cnic: str(fd, "cnic"), address: str(fd, "address"), join_date: str(fd, "join_date") || null, status: str(fd, "status") };
  if (fd.has("salary")) patch.salary = Number(fd.get("salary") || 0);
  const { error } = await (await supabase()).from("staff").update(patch).eq("id", id);
  redirect(`/staff/${id}?msg=${error ? encodeURIComponent(error.message) : "Saved"}`);
}

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("staff");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: st } = await sb.from("staff").select("*").eq("id", id).maybeSingle();
  if (!st) notFound();
  const month = new Date().toISOString().slice(0, 7);
  const [canEdit, canPay, canLeave, canAtt] = await Promise.all([can("staff", "edit"), can("payroll"), can("leave"), can("staff_attendance")]);
  const [att, leaves, pay] = await Promise.all([
    canAtt ? sb.from("staff_attendance").select("status,date").eq("staff_id", id).gte("date", month + "-01") : { data: [] },
    canLeave ? sb.from("leaves").select("id,from_date,to_date,kind,status").eq("staff_id", id).order("from_date", { ascending: false }).limit(5) : { data: [] },
    canPay ? sb.from("payroll").select("id,month,net,status").eq("staff_id", id).order("month", { ascending: false }).limit(6) : { data: [] },
  ]);
  let tmp: { id: string; email: string; pw: string } | null = null;
  try { const c = JSON.parse((await cookies()).get("sw_tmp")?.value ?? "null"); if (c?.id === id) tmp = c; } catch { /* no cookie */ }
  const count = (s: string) => (att.data ?? []).filter((a: { status: string }) => a.status === s).length;
  return (
    <>
      <PageHeader title={st.full_name} sub={`${st.emp_no} · ${st.designation ?? ""}`} />
      <Flash msg={first(sp.msg)} />
      {tmp && <><ClearTemp action={clearTmp} /><div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><b>Login created.</b> Give this to {st.full_name} now. It is shown only once and they must change it at first sign-in.<div className="mt-2 font-mono">{tmp.email} / {tmp.pw}</div></div></>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>{canEdit ? <StaffForm action={save.bind(null, id)} s={st} showSalary={canPay} /> : <p className="text-sm text-mute">View only.</p>}</Card>
        <div className="space-y-4">
          {canAtt && <Card><h2 className="mb-2 font-semibold">This month</h2><div className="flex flex-wrap gap-2"><Badge>Present {count("P")}</Badge><Badge tone="bad">Absent {count("A")}</Badge><Badge tone="warn">Leave {count("L")}</Badge></div></Card>}
          {canLeave && <Card><h2 className="mb-2 font-semibold">Recent leave</h2>{(leaves.data ?? []).length ? (leaves.data ?? []).map((l: { id: string; from_date: string; to_date: string; kind: string; status: string }) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{l.from_date} → {l.to_date} ({l.kind})</span><Badge tone={l.status === "approved" ? "ok" : l.status === "pending" ? "warn" : "bad"}>{l.status}</Badge></div>) : <span className="text-sm text-mute">None</span>}</Card>}
          {canPay && <Card><h2 className="mb-2 font-semibold">Payslips</h2><Table head={["Month", "Net", "Status"]}>{(pay.data ?? []).map((p: { id: string; month: string; net: number; status: string }) => <tr key={p.id}><td><a className="text-brand underline" href={`/payroll/${p.id}`}>{p.month}</a></td><td>{money(p.net)}</td><td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{p.status}</Badge></td></tr>)}</Table></Card>}
        </div>
      </div>
    </>
  );
}
