import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Flash, num, first, type SP } from "@/components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

async function setSlot(fd: FormData) {
  "use server";
  await guard("timetable", true);
  const cls = num(fd, "class_id"), day = num(fd, "day"), period = num(fd, "period"), sub = num(fd, "subject_id");
  if (!sub) { run("DELETE FROM timetable WHERE class_id=? AND day=? AND period=?", cls, day, period); redirect(`/timetable?class_id=${cls}`); }
  // Teacher clash: same teacher already teaching another class in this period.
  const t = one<{ teacher_id: number | null }>("SELECT teacher_id FROM subjects WHERE id=?", sub);
  if (t?.teacher_id) {
    const clash = one<{ n: string; s: string }>("SELECT c.name||'-'||c.section n, sb.name s FROM timetable tt JOIN subjects sb ON sb.id=tt.subject_id JOIN classes c ON c.id=tt.class_id WHERE tt.day=? AND tt.period=? AND sb.teacher_id=? AND tt.class_id!=?", day, period, t.teacher_id, cls);
    if (clash) redirect(`/timetable?class_id=${cls}&err=${encodeURIComponent(`Clash: that teacher already teaches ${clash.s} in ${clash.n} at this time.`)}`);
  }
  run("INSERT INTO timetable(class_id,day,period,subject_id) VALUES(?,?,?,?) ON CONFLICT(class_id,day,period) DO UPDATE SET subject_id=excluded.subject_id", cls, day, period, sub);
  redirect(`/timetable?class_id=${cls}`);
}

export default async function Timetable({ searchParams }: { searchParams: SP }) {
  const s = await guard("timetable");
  const sp = await searchParams;
  const classes = all<{ id: number; name: string; section: string }>("SELECT id,name,section FROM classes ORDER BY name,section");
  const cls = Number(first(sp.class_id)) || classes[0]?.id;
  const subs = all<{ id: number; name: string; tname: string | null }>("SELECT s.id,s.name,(SELECT name FROM staff WHERE id=s.teacher_id) tname FROM subjects s WHERE class_id=? ORDER BY name", cls);
  const slots = new Map(all<{ day: number; period: number; subject_id: number }>("SELECT * FROM timetable WHERE class_id=?", cls).map((x) => [`${x.day}_${x.period}`, x.subject_id]));
  const w = can(s.role, "timetable", true);
  return (
    <>
      <PageHeader title="Timetable" sub="Clashes between teachers are blocked automatically" />
      <Flash err={first(sp.err)} />
      <Card className="mb-4"><form className="flex items-end gap-2"><select name="class_id" defaultValue={cls} className="max-w-[12rem]">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select><button className="rounded-lg border border-line px-4 py-2 text-sm">View</button></form></Card>
      <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-center text-sm"><thead><tr><th className="p-2 text-left text-xs text-mute">Period</th>{DAYS.map((d) => <th key={d} className="p-2 text-xs uppercase text-mute">{d}</th>)}</tr></thead>
        <tbody>{PERIODS.map((p) => <tr key={p} className="border-t border-line"><td className="p-2 text-left font-medium">{p}</td>{DAYS.map((_, d) => { const cur = slots.get(`${d}_${p}`); const su = subs.find((x) => x.id === cur); return (
          <td key={d} className="p-1">{w ? <form action={setSlot}><input type="hidden" name="class_id" value={cls} /><input type="hidden" name="day" value={d} /><input type="hidden" name="period" value={p} />
            <select name="subject_id" defaultValue={cur ?? ""} className="!px-1 !py-1 text-xs"><option value="">—</option>{subs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="mt-1 text-[10px] text-brand">set</button></form>
            : su ? <div><div className="font-medium">{su.name}</div><div className="text-xs text-mute">{su.tname}</div></div> : <span className="text-mute">—</span>}</td>); })}</tr>)}</tbody></table></Card>
    </>
  );
}
