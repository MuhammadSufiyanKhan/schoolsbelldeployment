import { redirect } from "next/navigation";
import { guard, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Btn, Flash, today, str, first, type SP } from "@/components/ui";

async function mark(fd: FormData) {
  "use server";
  const p = await guard("staff_attendance", "add");
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/staff-attendance?msg=Invalid+date");
  const sb = await supabase();
  const ids = [...fd.keys()].filter((k) => k.startsWith("s_")).map((k) => k.slice(2));
  const { data: staff } = await sb.from("staff").select("id,campus_id").in("id", ids);
  const rows = (staff ?? []).map((s) => ({ staff_id: s.id, date, school_id: p.school_id, campus_id: s.campus_id, status: ["P", "A", "L"].includes(str(fd, "s_" + s.id)) ? str(fd, "s_" + s.id) : "P" }));
  const { error } = await sb.from("staff_attendance").upsert(rows, { onConflict: "staff_id,date" });
  redirect(`/staff-attendance?date=${date}&msg=${error ? encodeURIComponent(error.message) : "Attendance+saved"}`);
}

export default async function StaffAttendance({ searchParams }: { searchParams: SP }) {
  await guard("staff_attendance");
  const sp = await searchParams;
  const date = first(sp.date) || today();
  const sb = await supabase();
  const campus = await scopeCampusId();
  let q = sb.from("staff").select("id,full_name,designation").neq("status", "resigned").order("full_name");
  if (campus) q = q.eq("campus_id", campus);
  const [{ data: staff }, { data: att }] = await Promise.all([q, sb.from("staff_attendance").select("staff_id,status").eq("date", date)]);
  const status = new Map((att ?? []).map((a) => [a.staff_id, a.status]));
  const w = await can("staff_attendance", "add");
  return (
    <>
      <PageHeader title="Staff attendance" />
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-4 flex items-end gap-2"><input type="date" name="date" defaultValue={date} className="max-w-[12rem]" /><button className="rounded-lg border border-line px-4 py-2 text-sm">Go</button></form>
        <form action={mark}><input type="hidden" name="date" value={date} />
          <Table head={["Staff", "Designation", "Status"]} empty={staff?.length ? undefined : "No staff."}>
            {(staff ?? []).map((r) => <tr key={r.id}><td className="font-medium">{r.full_name}</td><td>{r.designation}</td><td><div className="flex gap-3 text-sm">{[["P", "Present"], ["A", "Absent"], ["L", "Leave"]].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="radio" name={`s_${r.id}`} value={v} disabled={!w} defaultChecked={(status.get(r.id) ?? "P") === v} />{l}</label>)}</div></td></tr>)}
          </Table>{w && !!staff?.length && <div className="mt-4"><Btn>Save attendance</Btn></div>}</form>
      </Card>
    </>
  );
}
