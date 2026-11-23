import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { Card, PageHeader, Table, Badge, money, str, first, Flash, type SP } from "@/components/ui";
import StudentForm from "../student-form";

async function save(id: string, fd: FormData) {
  "use server";
  await guard("students", "edit");
  const sb = await supabase();
  const { error } = await sb.from("students").update({
    full_name: str(fd, "full_name"), full_name_ur: str(fd, "full_name_ur") || null, gender: str(fd, "gender"), dob: str(fd, "dob") || null, class_id: str(fd, "class_id"),
    guardian_name: str(fd, "guardian_name"), guardian_phone: str(fd, "guardian_phone"), guardian_email: str(fd, "guardian_email").toLowerCase() || null,
    address: str(fd, "address"), status: str(fd, "status"),
  }).eq("id", id);
  redirect(`/students/${id}?msg=${error ? encodeURIComponent(error.message) : "Saved"}`);
}
async function decide(id: string, fd: FormData) {
  "use server";
  await guard("students", "edit");
  const status = str(fd, "status") === "confirmed" ? "confirmed" : "rejected";
  await (await supabase()).from("student_guardians").update({ status }).eq("student_id", id).eq("user_id", str(fd, "user_id"));
  redirect(`/students/${id}?msg=Parent+link+${status}`);
}

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("students");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: st } = await sb.from("students").select("*").eq("id", id).maybeSingle();
  if (!st) notFound();
  const [{ data: classes }, { data: att }, links] = await Promise.all([
    sb.from("classes").select("id,name,section").order("name").order("section"),
    sb.from("attendance").select("status").eq("student_id", id),
    sb.from("student_guardians").select("user_id,status").eq("student_id", id),
  ]);
  const canEdit = await can("students", "edit");
  const present = (att ?? []).filter((a) => a.status === "P").length;
  // parent emails: auth users are not readable through RLS, so look them up server-side after the permission check above
  const parents = await Promise.all((links.data ?? []).map(async (l) => ({ ...l, email: (await admin().auth.admin.getUserById(l.user_id)).data.user?.email ?? "?" })));
  const canFees = await can("fees");
  let fees: { month: string; amount: number; discount: number; payments: { amount: number; voided_at: string | null }[] }[] = [];
  if (canFees) fees = ((await sb.from("challans").select("month,amount,discount,payments(amount,voided_at)").eq("student_id", id).order("month", { ascending: false })).data ?? []) as typeof fees;
  return (
    <>
      <PageHeader title={st.full_name} sub={`Admission ${st.admission_no}`} />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>{canEdit ? <StudentForm action={save.bind(null, id)} s={st} classes={classes ?? []} /> : <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-mute">Guardian</dt><dd>{st.guardian_name}</dd><dt className="text-mute">Phone</dt><dd>{st.guardian_phone}</dd><dt className="text-mute">DOB</dt><dd>{st.dob}</dd></dl>}</Card>
        <div className="space-y-4">
          <Card><div className="text-sm text-mute">Attendance</div><div className="text-2xl font-bold">{att?.length ? Math.round((present / att.length) * 100) + "%" : "—"}</div><div className="text-xs text-mute">{present} of {att?.length ?? 0} days present</div></Card>
          <Card><h2 className="mb-2 font-semibold">Parent accounts</h2>
            {parents.length ? parents.map((l) => <div key={l.user_id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate">{l.email}</span>
              <span className="flex items-center gap-1"><Badge tone={l.status === "confirmed" ? "ok" : l.status === "pending" ? "warn" : "bad"}>{l.status}</Badge>
                {canEdit && l.status !== "confirmed" && <form action={decide.bind(null, id)}><input type="hidden" name="user_id" value={l.user_id} /><button name="status" value="confirmed" className="rounded bg-teal-600 px-2 py-1 text-xs text-white">Confirm</button></form>}
                {canEdit && l.status === "pending" && <form action={decide.bind(null, id)}><input type="hidden" name="user_id" value={l.user_id} /><button name="status" value="rejected" className="rounded bg-red-600 px-2 py-1 text-xs text-white">Reject</button></form>}</span></div>) : <span className="text-sm text-mute">No parent has joined yet.</span>}</Card>
          {canFees && <Card><h2 className="mb-2 font-semibold">Fees</h2><Table head={["Month", "Billed", "Status"]}>{fees.map((i) => { const bill = Number(i.amount) - Number(i.discount); const paid = i.payments.filter((x) => !x.voided_at).reduce((a, x) => a + Number(x.amount), 0); return <tr key={i.month}><td>{i.month}</td><td>{money(bill)}</td><td><Badge tone={paid >= bill ? "ok" : paid ? "warn" : "bad"}>{paid >= bill ? "Paid" : money(bill - paid) + " due"}</Badge></td></tr>; })}</Table></Card>}
        </div>
      </div>
    </>
  );
}
