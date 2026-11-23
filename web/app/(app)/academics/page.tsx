import Link from "next/link";
import { redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai";
import AcademicsGenerator from "@/components/academics-generator";
import { Card, PageHeader, Flash, Table, Badge, first, type SP } from "@/components/ui";

async function saveGenerated(fd: FormData) {
  "use server";
  const p = await guard("academics", "add");
  const kind = String(fd.get("kind")), classId = String(fd.get("class_id")), subjectId = String(fd.get("subject_id")) || null;
  let body: { questions?: { q: string; options: string[]; answer: number; explanation: string }[] } & Record<string, unknown>;
  try { body = JSON.parse(String(fd.get("body"))); } catch { redirect("/academics?msg=Could+not+read+it"); }
  const sb = await supabase();
  const { data: c } = await sb.from("classes").select("campus_id").eq("id", classId).maybeSingle();
  if (!c) redirect("/academics?msg=Class+not+found");
  const base = { school_id: p.school_id, campus_id: c.campus_id, class_id: classId, subject_id: subjectId, title: String(fd.get("title") || "Untitled").slice(0, 150), created_by: p.id };
  let err: string | undefined, tab = "papers";
  if (kind === "paper") { const r = await sb.from("question_papers").insert({ ...base, chapters: String(fd.get("chapters") ?? ""), body }); err = r.error?.message; }
  else if (kind === "plan") { tab = "plans"; const per = String(fd.get("period")); const r = await sb.from("lesson_plans").insert({ ...base, kind: ["year", "month", "daily"].includes(per) ? per : "daily", period: per, body }); err = r.error?.message; }
  else if (kind === "test") {
    tab = "tests";
    const qs = body.questions ?? [];
    const { data: t, error } = await sb.from("mcq_tests").insert({ ...base, questions: qs.map((q) => ({ q: q.q, options: q.options })) }).select("id").single();
    if (error || !t) err = error?.message ?? "Could not save";
    else { const { error: e2 } = await sb.from("mcq_keys").insert({ test_id: t.id, school_id: p.school_id, campus_id: c.campus_id, class_id: classId, answers: qs.map((q) => ({ a: q.answer, why: q.explanation })) }); err = e2?.message; if (e2) await sb.from("mcq_tests").delete().eq("id", t.id); }
  }
  redirect(`/academics?tab=${tab}&msg=${err ? encodeURIComponent(err) : "Saved"}`);
}
async function togglePublish(id: string, on: boolean) {
  "use server";
  await guard("academics", "add");
  await (await supabase()).from("mcq_tests").update({ published: on }).eq("id", id);
  redirect("/academics?tab=tests&msg=" + (on ? "Published:+parents+can+now+take+it" : "Unpublished"));
}

export default async function Academics({ searchParams }: { searchParams: SP }) {
  await guard("academics");
  const sp = await searchParams; const sb = await supabase();
  const tab = (["papers", "plans", "tests"].includes(first(sp.tab) ?? "") ? first(sp.tab) : "papers") as "papers" | "plans" | "tests";
  const kind = tab === "papers" ? "paper" : tab === "plans" ? "plan" : "test";
  const [{ data: classes }, { data: subjects }] = await Promise.all([sb.from("classes").select("id,name,section").order("name").order("section"), sb.from("subjects").select("id,name,class_id")]);
  const table = tab === "papers" ? "question_papers" : tab === "plans" ? "lesson_plans" : "mcq_tests";
  const { data: rows } = await sb.from(table).select(tab === "tests" ? "id,title,created_at,published,classes(name,section),subjects(name)" : "id,title,created_at,classes(name,section),subjects(name)").order("created_at", { ascending: false }).limit(50);
  const list = (rows ?? []) as unknown as { id: string; title: string; created_at: string; published?: boolean; classes: { name: string; section: string }; subjects: { name: string } | null }[];
  const w = await can("academics", "add");
  return (
    <>
      <PageHeader title="Papers & plans" sub="Exam papers, lesson plans and MCQ tests, written by AI for you to check." />
      <Flash msg={first(sp.msg)} />
      <div className="mb-4 flex gap-2 text-sm">{([["papers", "Exam papers"], ["plans", "Lesson plans"], ["tests", "MCQ tests"]] as const).map(([k, l]) => <Link key={k} href={`/academics?tab=${k}`} className={`rounded-full border border-line px-3 py-1 ${tab === k ? "bg-brand text-white dark:text-black" : ""}`}>{l}</Link>)}</div>
      {w && (aiReady() ? <Card><AcademicsGenerator key={kind} kind={kind} save={saveGenerated} classes={(classes ?? []).map((c) => ({ id: c.id, label: `${c.name}-${c.section}`, subjects: (subjects ?? []).filter((s) => s.class_id === c.id).map((s) => ({ id: s.id, name: s.name })) }))} /></Card> : <Card><p className="text-sm">AI is not set up (GEMINI_API_KEY).</p></Card>)}
      <Card className="mt-4"><Table head={["Title", "Class", "Subject", "Saved", ...(tab === "tests" ? ["Parents"] : [])]} empty={list.length ? undefined : "Nothing saved yet."}>
        {list.map((r) => <tr key={r.id}><td><Link className="font-medium text-brand hover:underline" href={`/academics/view/${kind}/${r.id}`}>{r.title}</Link></td><td>{r.classes.name}-{r.classes.section}</td><td>{r.subjects?.name ?? "—"}</td><td>{r.created_at.slice(0, 10)}</td>
          {tab === "tests" && <td>{w ? <form action={togglePublish.bind(null, r.id, !r.published)}><button className="text-sm underline">{r.published ? "Published · unpublish" : "Publish"}</button></form> : <Badge tone={r.published ? "ok" : "mute"}>{r.published ? "Published" : "Draft"}</Badge>}</td>}</tr>)}
      </Table></Card>
    </>
  );
}
