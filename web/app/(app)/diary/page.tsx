import { redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai";
import DiaryRecorder from "@/components/diary-recorder";
import { Card, PageHeader, Flash, Table, first, type SP } from "@/components/ui";

type Row = { id: string; text: string };
async function saveDiary(fd: FormData) {
  "use server";
  const p = await guard("diary", "add");
  const classId = String(fd.get("class_id") ?? ""), date = String(fd.get("date") ?? "");
  let rows: { subject_id: string; classwork_en: string; classwork_ur: string; homework_en: string; homework_ur: string }[] = [];
  try { rows = JSON.parse(String(fd.get("rows") ?? "[]")); } catch { /* handled below */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rows.length || rows.length > 30) redirect("/diary?msg=Nothing+to+save");
  const sb = await supabase();
  const { data: c } = await sb.from("classes").select("campus_id").eq("id", classId).maybeSingle();
  if (!c) redirect("/diary?msg=Class+not+found");
  const clip = (s: unknown) => String(s ?? "").slice(0, 2000);
  const { error } = await sb.from("diary_entries").upsert(rows.map((r) => ({
    school_id: p.school_id, campus_id: c.campus_id, class_id: classId, subject_id: String(r.subject_id), date, source: "ai", created_by: p.id,
    classwork_en: clip(r.classwork_en), classwork_ur: clip(r.classwork_ur), homework_en: clip(r.homework_en), homework_ur: clip(r.homework_ur),
  })), { onConflict: "class_id,subject_id,date" });
  redirect(`/diary?msg=${error ? encodeURIComponent(error.message) : `Saved+${rows.length}+diary+entries.+Parents+can+now+see+them.`}`);
}
export default async function Diary({ searchParams }: { searchParams: SP }) {
  await guard("diary");
  const sp = await searchParams; const sb = await supabase();
  const [{ data: classes }, { data: recent }] = await Promise.all([
    sb.from("classes").select("id,name,section").order("name").order("section"),
    sb.from("diary_entries").select("id,date,classwork_en,homework_en,classes(name,section),subjects(name)").order("date", { ascending: false }).limit(40),
  ]);
  const w = await can("diary", "add");
  const list = (recent ?? []) as unknown as { id: string; date: string; classwork_en: string; homework_en: string; classes: { name: string; section: string }; subjects: { name: string } }[];
  void (null as unknown as Row);
  return (
    <>
      <PageHeader title="Diary" sub="Say the day’s classwork and homework. Parents get it in English and Urdu." />
      <Flash msg={first(sp.msg)} />
      {w && (aiReady() ? <Card><DiaryRecorder classes={(classes ?? []).map((c) => ({ id: c.id, label: `${c.name}-${c.section}` }))} save={saveDiary} /></Card> : <Card><p className="text-sm">AI is not set up (GEMINI_API_KEY).</p></Card>)}
      <h2 className="mb-2 mt-6 font-semibold">Recent entries</h2>
      <Card><Table head={["Date", "Class", "Subject", "Classwork", "Homework"]} empty={list.length ? undefined : "No diary entries yet."}>
        {list.map((r) => <tr key={r.id}><td>{r.date}</td><td>{r.classes.name}-{r.classes.section}</td><td>{r.subjects.name}</td><td>{r.classwork_en}</td><td>{r.homework_en}</td></tr>)}
      </Table></Card>
    </>
  );
}
