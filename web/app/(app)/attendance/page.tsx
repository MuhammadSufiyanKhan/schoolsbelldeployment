import { guard, can } from "@/lib/auth";
import AttendanceForm from "@/components/attendance-form";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, Flash, today, first, type SP } from "@/components/ui";

export default async function Attendance({ searchParams }: { searchParams: SP }) {
  await guard("attendance");
  const sp = await searchParams;
  const sb = await supabase();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section"); // RLS: teachers get only their own classes
  const cls = first(sp.class_id) || classes?.[0]?.id;
  const date = first(sp.date) || today();
  const ok = !!cls && !!classes?.some((c) => c.id === cls);
  let students: { id: string; admission_no: string; full_name: string }[] = [];
  let status = new Map<string, string>();
  const low: { name: string; pct: number }[] = [];
  if (ok) {
    students = (await sb.from("students").select("id,admission_no,full_name").eq("class_id", cls!).eq("status", "active").order("full_name")).data ?? [];
    const { data: all } = await sb.from("attendance").select("student_id,date,status").eq("class_id", cls!);
    status = new Map((all ?? []).filter((a) => a.date === date).map((a) => [a.student_id, a.status]));
    for (const s of students) {
      const mine = (all ?? []).filter((a) => a.student_id === s.id);
      if (mine.length >= 4) { const pct = Math.round((mine.filter((a) => a.status === "P").length / mine.length) * 100); if (pct < 75) low.push({ name: s.full_name, pct }); }
    }
  }
  const canMark = await can("attendance", "add");
  return (
    <>
      <PageHeader title="Student attendance" />
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-2"><select name="class_id" defaultValue={cls} className="max-w-[12rem]">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select><input type="date" name="date" defaultValue={date} className="max-w-[12rem]" /><button className="rounded-lg border border-line px-4 py-2 text-sm">Load</button></form>
        {ok && <AttendanceForm key={`${cls}-${date}`} students={students} initial={Object.fromEntries(status)} classId={cls!} date={date} canMark={canMark} />}
        {!ok && <p className="text-sm text-mute">No class available to you.</p>}
      </Card>
      {low.length > 0 && <Card className="mt-4"><h2 className="mb-2 font-semibold">Below 75% attendance</h2><div className="flex flex-wrap gap-2">{low.map((l) => <Badge key={l.name} tone="bad">{l.name} · {l.pct}%</Badge>)}</div></Card>}
    </>
  );
}
