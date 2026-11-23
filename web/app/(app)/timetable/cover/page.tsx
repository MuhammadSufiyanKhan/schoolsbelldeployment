import { redirect } from "next/navigation";
import { guard, activeCampus } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, LinkBtn, Btn, Flash, Table, first, today, type SP } from "@/components/ui";

const DAYN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Slot = { id: string; class_id: string; period: number; classes: { name: string; section: string }; subjects: { name: string; teacher_id: string | null } };

async function assign(fd: FormData) {
  "use server";
  const p = await guard("timetable", "add");
  const date = String(fd.get("date")), away = String(fd.get("staff"));
  const sb = await supabase();
  const picks: { class_id: string; period: number; cover: string; subject: string; label: string }[] = [];
  for (const [k, v] of fd.entries()) { const m = /^cover_([0-9a-f-]{36})_(\d+)$/.exec(k); if (m && v) picks.push({ class_id: m[1], period: Number(m[2]), cover: String(v), subject: String(fd.get(`sub_${m[1]}_${m[2]}`) ?? ""), label: String(fd.get(`lab_${m[1]}_${m[2]}`) ?? "") }); }
  if (!picks.length) redirect(`/timetable/cover?date=${date}&staff=${away}&msg=Choose+a+teacher+for+at+least+one+period`);
  const { data: cls } = await sb.from("classes").select("id,campus_id").in("id", picks.map((x) => x.class_id));
  const campus = new Map((cls ?? []).map((c) => [c.id, c.campus_id]));
  const { error } = await sb.from("cover_assignments").upsert(picks.filter((x) => campus.has(x.class_id)).map((x) => ({ school_id: p.school_id, campus_id: campus.get(x.class_id)!, date, class_id: x.class_id, period: x.period, absent_staff: away, cover_staff: x.cover, subject_name: x.subject })), { onConflict: "date,class_id,period" });
  if (error) redirect(`/timetable/cover?date=${date}&staff=${away}&msg=${encodeURIComponent(error.message)}`);
  // tell the teachers: a staff notice that names each one (people only see their own line first, the rest is for transparency)
  const { data: names } = await sb.from("staff").select("id,full_name").in("id", [away, ...picks.map((x) => x.cover)]);
  const nm = (id: string) => names?.find((n) => n.id === id)?.full_name ?? "?";
  const campusId = (await activeCampus())?.id ?? null;
  await sb.from("notices").insert({ school_id: p.school_id, campus_id: campusId, title: `Cover for ${nm(away)} on ${date}`, audience: "staff", created_by: p.id,
    body: picks.map((x) => `Period ${x.period}, ${x.label}: ${nm(x.cover)} covers.`).join("\n") });
  redirect(`/timetable/cover?date=${date}&staff=${away}&msg=${encodeURIComponent("Cover arranged and the staff notice is posted.")}`);
}

export default async function Cover({ searchParams }: { searchParams: SP }) {
  await guard("timetable");
  const sp = await searchParams; const sb = await supabase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.date) ?? "") ? first(sp.date)! : today();
  const day = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  const [{ data: staff }, { data: absent }, { data: slots }, { data: have }, { data: monthCover }] = await Promise.all([
    sb.from("staff").select("id,full_name").neq("status", "resigned").order("full_name"),
    sb.from("staff_attendance").select("staff_id").eq("date", date).in("status", ["A", "L"]),
    sb.from("timetable").select("id,class_id,day,period,classes(name,section),subjects(name,teacher_id)").eq("day", day).order("period"),
    sb.from("cover_assignments").select("class_id,period,cover_staff").eq("date", date),
    sb.from("cover_assignments").select("cover_staff").gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
  ]);
  const absentIds = new Set((absent ?? []).map((a) => a.staff_id));
  const away = first(sp.staff) ?? [...absentIds][0] ?? "";
  const all = (slots ?? []) as unknown as Slot[];
  const mine = all.filter((s) => s.subjects.teacher_id === away);
  const load = new Map<string, number>(); for (const c of monthCover ?? []) if (c.cover_staff) load.set(c.cover_staff, (load.get(c.cover_staff) ?? 0) + 1);
  const taken = new Set((have ?? []).map((h) => `${h.cover_staff}|${h.period}`));
  const subjectsOf = (id: string) => new Set(all.filter((s) => s.subjects.teacher_id === id).map((s) => s.subjects.name.toLowerCase()));
  const options = (s: Slot) => {
    const busy = new Set(all.filter((x) => x.period === s.period).map((x) => x.subjects.teacher_id));
    return (staff ?? []).filter((t) => t.id !== away && !busy.has(t.id) && !absentIds.has(t.id) && !taken.has(`${t.id}|${s.period}`))
      .map((t) => ({ ...t, score: (subjectsOf(t.id).has(s.subjects.name.toLowerCase()) ? -100 : 0) + (load.get(t.id) ?? 0) })).sort((a, b) => a.score - b.score);
  };
  return (
    <>
      <PageHeader title="Cover" sub="A teacher is away: each period goes to the best free teacher."><LinkBtn href="/timetable" ghost>Back</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card><form className="flex flex-wrap items-end gap-3"><label className="text-sm">Date<input type="date" name="date" defaultValue={date} /></label>
        <label className="text-sm">Teacher who is away<select name="staff" defaultValue={away}><option value="">—</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{absentIds.has(s.id) ? " (marked absent)" : ""}</option>)}</select></label><Btn variant="ghost">Show periods</Btn></form></Card>
      {away && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">{DAYN[day] ?? "Sunday"}, {date}</h2>
          {!mine.length ? <p className="text-sm text-mute">This teacher has no periods that day. Nothing to cover.</p> : (
            <form action={assign}><input type="hidden" name="date" value={date} /><input type="hidden" name="staff" value={away} />
              <Table head={["Period", "Class", "Subject", "Cover by"]}>
                {mine.map((s) => { const o = options(s); const done = have?.find((h) => h.class_id === s.class_id && h.period === s.period)?.cover_staff; return (
                  <tr key={s.id}><td>{s.period}</td><td>{s.classes.name}-{s.classes.section}</td><td>{s.subjects.name}
                    <input type="hidden" name={`sub_${s.class_id}_${s.period}`} value={s.subjects.name} /><input type="hidden" name={`lab_${s.class_id}_${s.period}`} value={`${s.classes.name}-${s.classes.section} ${s.subjects.name}`} /></td>
                    <td><select name={`cover_${s.class_id}_${s.period}`} defaultValue={done ?? o[0]?.id ?? ""}>{!o.length && <option value="">No free teacher</option>}{o.map((t, i) => <option key={t.id} value={t.id}>{t.full_name}{i === 0 ? " ★ best" : ""}{subjectsOf(t.id).has(s.subjects.name.toLowerCase()) ? " · teaches this subject" : ""}</option>)}</select></td></tr>); })}
              </Table>
              <p className="my-2 text-xs text-mute">★ best: teaches the same subject, then whoever has covered fewest periods this month.</p><Btn>Arrange cover and tell the teachers</Btn></form>)}
        </Card>)}
    </>
  );
}
