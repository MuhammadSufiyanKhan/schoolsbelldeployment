import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import SlotForm, { type SlotState } from "@/components/slot-form";
import { guard, can, activeCampus, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Flash, Btn, Field, LinkBtn, str, first, type SP } from "@/components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

async function setSlot(_prev: SlotState, fd: FormData): Promise<SlotState> {
  "use server";
  const p = await guard("timetable", "add");
  const cls = str(fd, "class_id"), day = Number(fd.get("day")), period = Number(fd.get("period")), subject = str(fd, "subject_id"), room = str(fd, "room_id") || null;
  const sb = await supabase();
  if (!subject) {
    const { error } = await sb.from("timetable").delete().eq("class_id", cls).eq("day", day).eq("period", period);
    revalidatePath("/timetable");
    return error ? { error: error.message } : {};
  }
  const { data: c } = await sb.from("classes").select("campus_id").eq("id", cls).maybeSingle();
  if (!c) return { error: "Class not found" };
  const { error } = await sb.from("timetable").upsert({ school_id: p.school_id, campus_id: c.campus_id, class_id: cls, day, period, subject_id: subject, room_id: room }, { onConflict: "class_id,day,period" });
  if (error) return { error: error.message };   // a teacher or room booked twice is refused by the database; its message is shown in the cell
  revalidatePath("/timetable");
  return {};
}
async function addRoom(fd: FormData) {
  "use server";
  const p = await guard("timetable", "add");
  const campus = await activeCampus();
  if (campus && str(fd, "name")) await (await supabase()).from("rooms").insert({ school_id: p.school_id, campus_id: campus.id, name: str(fd, "name") });
  redirect("/timetable");
}

type Slot = { class_id: string; day: number; period: number; subject_id: string; room_id: string | null; subjects: { name: string; teacher_id: string | null; staff: { full_name: string } | null }; classes: { name: string; section: string }; rooms: { name: string } | null };

export default async function Timetable({ searchParams }: { searchParams: SP }) {
  await guard("timetable");
  const sp = await searchParams;
  const sb = await supabase();
  const campus = await scopeCampusId();
  const view = first(sp.view) === "teacher" ? "teacher" : first(sp.view) === "room" ? "room" : "class";
  const [{ data: classes }, { data: rooms }, { data: teachers }] = await Promise.all([
    sb.from("classes").select("id,name,section").order("name").order("section"),
    sb.from("rooms").select("id,name").order("name"),
    sb.from("staff").select("id,full_name").eq("status", "active").order("full_name"),  // empty for roles that cannot read staff: they get class/room views
  ]);
  const cls = first(sp.class_id) || classes?.[0]?.id;
  const who = first(sp.who) || (view === "teacher" ? teachers?.[0]?.id : rooms?.[0]?.id);
  let q = sb.from("timetable").select("class_id,day,period,subject_id,room_id,subjects(name,teacher_id,staff(full_name)),classes(name,section),rooms(name)");
  if (campus) q = q.eq("campus_id", campus);
  const all = ((await q).data ?? []) as unknown as Slot[];
  const shown = all.filter((s) => (view === "class" ? s.class_id === cls : view === "teacher" ? s.subjects.teacher_id === who : s.room_id === who));
  const at = (d: number, p: number) => shown.find((s) => s.day === d && s.period === p);
  const { data: subs } = view === "class" && cls ? await sb.from("subjects").select("id,name,staff(full_name)").eq("class_id", cls).order("name") : { data: [] };
  const w = (await can("timetable", "add")) && view === "class";
  const tab = (v: string, l: string) => <a key={v} href={`/timetable?view=${v}`} className={`rounded-full border border-line px-3 py-1 text-sm ${view === v ? "bg-brand text-white dark:text-black" : ""}`}>{l}</a>;
  return (
    <>
      <PageHeader title="Timetable" sub="A teacher or a room booked twice is refused automatically">{(await can("timetable", "add")) && <><LinkBtn href="/timetable/generate">✨ AI timetable</LinkBtn><LinkBtn href="/timetable/cover" ghost>Cover</LinkBtn></>}</PageHeader>
      <Flash err={first(sp.err)} />
      <Card className="mb-4"><div className="mb-3 flex gap-2">{tab("class", "By class")}{teachers?.length ? tab("teacher", "By teacher") : null}{tab("room", "By room")}</div>
        <form className="flex items-end gap-2"><input type="hidden" name="view" value={view} />
          {view === "class" ? <select name="class_id" defaultValue={cls} className="max-w-[12rem]">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select>
            : <select name="who" defaultValue={who} className="max-w-[14rem]">{(view === "teacher" ? teachers ?? [] : rooms ?? []).map((x) => <option key={x.id} value={x.id}>{"full_name" in x ? x.full_name : x.name}</option>)}</select>}
          <button className="rounded-lg border border-line px-4 py-2 text-sm">View</button></form></Card>
      <Card className="overflow-x-auto"><table className="w-full min-w-[700px] text-center text-sm"><thead><tr><th className="p-2 text-left text-xs text-mute">Period</th>{DAYS.map((d) => <th key={d} className="p-2 text-xs uppercase text-mute">{d}</th>)}</tr></thead>
        <tbody>{PERIODS.map((p) => <tr key={p} className="border-t border-line"><td className="p-2 text-left font-medium">{p}</td>{DAYS.map((_, d) => { const s = at(d, p); return (
          <td key={d} className="p-1 align-top">{w ? <SlotForm action={setSlot} classId={cls!} day={d} period={p} subjects={(subs ?? []).map((x) => ({ id: x.id, name: x.name }))} rooms={rooms ?? []} subjectId={s?.subject_id ?? ""} roomId={s?.room_id ?? ""} />
            : s ? <div><div className="font-medium">{s.subjects.name}</div><div className="text-xs text-mute">{view === "class" ? s.subjects.staff?.full_name : `${s.classes.name}-${s.classes.section}`}{s.rooms ? ` · ${s.rooms.name}` : ""}</div></div> : <span className="text-mute">—</span>}</td>); })}</tr>)}</tbody></table></Card>
      {(await can("timetable", "add")) && <Card className="mt-4 max-w-sm"><h2 className="mb-2 font-semibold">Add a room</h2><form action={addRoom} className="flex gap-2"><Field label=""><input name="name" placeholder="Room 12" required /></Field><Btn variant="ghost">Add</Btn></form></Card>}
    </>
  );
}
