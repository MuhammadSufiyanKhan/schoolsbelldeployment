import { redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, Btn, Field, Flash, str, first, type SP } from "@/components/ui";

async function apply(fd: FormData) {
  "use server";
  const p = await guard("leave", "add");
  const sb = await supabase();
  const { data: me } = await sb.from("staff").select("id,campus_id").eq("user_id", p.id).maybeSingle();
  if (!me) redirect("/leave?msg=Your+account+is+not+linked+to+a+staff+record");
  const from = str(fd, "from"), to = str(fd, "to");
  if (!from || !to || to < from) redirect("/leave?msg=Check+the+dates");
  const { error } = await sb.from("leaves").insert({ school_id: p.school_id, campus_id: me!.campus_id, staff_id: me!.id, from_date: from, to_date: to, kind: str(fd, "kind"), reason: str(fd, "reason") });
  redirect(`/leave?msg=${error ? encodeURIComponent(error.message) : "Leave+request+sent"}`);
}
async function decide(fd: FormData) {
  "use server";
  const p = await guard("leave", "edit");
  const sb = await supabase();
  const status = str(fd, "status") === "approved" ? "approved" : "rejected";
  const id = str(fd, "id");
  const { data: l, error } = await sb.from("leaves").update({ status, decided_by: p.id }).eq("id", id).select("staff_id,campus_id,from_date,to_date").maybeSingle();
  if (error) redirect("/leave?msg=" + encodeURIComponent(error.message));   // e.g. the database refuses self-approval
  if (status === "approved" && l) {
    const days: { staff_id: string; date: string; school_id: string; campus_id: string; status: string }[] = [];
    for (let d = new Date(l.from_date + "T00:00:00Z"); d <= new Date(l.to_date + "T00:00:00Z") && days.length < 62; d.setUTCDate(d.getUTCDate() + 1))
      days.push({ staff_id: l.staff_id, date: d.toISOString().slice(0, 10), school_id: p.school_id, campus_id: l.campus_id, status: "L" });
    await sb.from("staff_attendance").upsert(days, { onConflict: "staff_id,date" });   // approved leave shows as Leave, not Absent, so it is not deducted
  }
  redirect(`/leave?msg=Leave+${status}`);
}

export default async function Leave({ searchParams }: { searchParams: SP }) {
  const p = await guard("leave");
  const sp = await searchParams;
  const sb = await supabase();
  const [{ data: rows }, { data: me }] = await Promise.all([
    sb.from("leaves").select("id,from_date,to_date,kind,reason,status,staff(full_name)").order("created_at", { ascending: false }),
    sb.from("staff").select("id").eq("user_id", p.id).maybeSingle(),
  ]);
  const list = (rows ?? []) as unknown as { id: string; from_date: string; to_date: string; kind: string; reason: string; status: string; staff: { full_name: string } }[];
  const decider = await can("leave", "edit");
  return (
    <>
      <PageHeader title="Leave" sub={decider ? "Approve or reject staff leave" : "Your leave requests"} />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {me && (await can("leave", "add")) && <Card><h2 className="mb-3 font-semibold">Apply for leave</h2>
          <form action={apply} className="space-y-3"><Field label="From"><input type="date" name="from" required /></Field><Field label="To"><input type="date" name="to" required /></Field>
            <Field label="Type"><select name="kind"><option>casual</option><option>sick</option><option>annual</option><option>unpaid</option></select></Field><Field label="Reason"><textarea name="reason" rows={2} /></Field><Btn>Submit</Btn></form></Card>}
        <Card className={me ? "" : "lg:col-span-2"}><Table head={["Staff", "Dates", "Type", "Reason", "Status", ""]} empty={list.length ? undefined : "No leave requests."}>
          {list.map((r) => <tr key={r.id}><td>{r.staff?.full_name}</td><td className="whitespace-nowrap">{r.from_date} → {r.to_date}</td><td>{r.kind}</td><td>{r.reason}</td>
            <td><Badge tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "bad"}>{r.status}</Badge></td>
            <td>{decider && r.status === "pending" && <form action={decide} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><button name="status" value="approved" className="rounded bg-teal-600 px-2 py-1 text-xs text-white">Approve</button><button name="status" value="rejected" className="rounded bg-red-600 px-2 py-1 text-xs text-white">Reject</button></form>}</td></tr>)}
        </Table></Card>
      </div>
    </>
  );
}
