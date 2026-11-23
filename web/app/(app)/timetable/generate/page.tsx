import { redirect } from "next/navigation";
import { guard, activeCampus } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai";
import TimetableGenerator from "@/components/timetable-generator";
import { Card, PageHeader, LinkBtn, Flash, first, type SP } from "@/components/ui";

async function saveGenerated(fd: FormData) {
  "use server";
  const p = await guard("timetable", "add");
  let placed: { class_id: string; day: number; period: number; subject_id: string }[] = [], ids: string[] = [];
  try { placed = JSON.parse(String(fd.get("placed"))); ids = JSON.parse(String(fd.get("class_ids"))); } catch { redirect("/timetable/generate?msg=Could+not+read+the+timetable"); }
  const sb = await supabase();
  const { data: cls } = await sb.from("classes").select("id,campus_id").in("id", ids);
  const campus = new Map((cls ?? []).map((c) => [c.id, c.campus_id]));
  const rows = placed.filter((r) => campus.has(r.class_id) && r.day >= 0 && r.day <= 5 && r.period >= 1 && r.period <= 10).map((r) => ({ school_id: p.school_id, campus_id: campus.get(r.class_id)!, class_id: r.class_id, day: r.day, period: r.period, subject_id: r.subject_id }));
  // the old slots are removed first; the database's clash trigger then checks every new one
  const { data: old } = await sb.from("timetable").select("id,class_id,day,period,subject_id,room_id,school_id,campus_id").in("class_id", [...campus.keys()]);
  await sb.from("timetable").delete().in("class_id", [...campus.keys()]);
  const { error } = await sb.from("timetable").insert(rows);
  if (error) {
    if (old?.length) await sb.from("timetable").insert(old);   // put the previous timetable back
    redirect(`/timetable/generate?msg=${encodeURIComponent("Not saved, the old timetable was kept: " + error.message)}`);
  }
  redirect(`/timetable?msg=${encodeURIComponent(`Saved ${rows.length} periods for ${campus.size} classes.`)}`);
}
export default async function Generate({ searchParams }: { searchParams: SP }) {
  await guard("timetable", "add"); void activeCampus; void redirect;
  const sp = await searchParams; const sb = await supabase();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section");
  return (
    <>
      <PageHeader title="AI timetable" sub="Write your rules. Every class gets a full timetable with no clashes."><LinkBtn href="/timetable" ghost>Back</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>{aiReady() ? <TimetableGenerator classes={(classes ?? []).map((c) => ({ id: c.id, label: `${c.name}-${c.section}` }))} save={saveGenerated} /> : <p className="text-sm">AI is not set up (GEMINI_API_KEY).</p>}</Card>
      <p className="mt-3 text-xs text-mute">The AI only reads your rules. The periods are placed by the system itself, so a teacher is never in two classes at once. Teacher names are replaced by codes before your rules are sent to Google.</p>
    </>
  );
}
