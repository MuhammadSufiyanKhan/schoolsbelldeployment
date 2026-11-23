import { notFound } from "next/navigation";
import { guard } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, LinkBtn, Table } from "@/components/ui";
import PrintButton from "@/components/print-button";

export default async function View({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await guard("academics");
  const { kind, id } = await params; const sb = await supabase();
  const table = kind === "paper" ? "question_papers" : kind === "plan" ? "lesson_plans" : kind === "test" ? "mcq_tests" : null; if (!table) notFound();
  const { data: r } = await sb.from(table).select("*,classes(name,section),subjects(name)").eq("id", id).maybeSingle(); if (!r) notFound();
  const cls = r.classes as { name: string; section: string }, sub = (r.subjects as { name: string } | null)?.name;
  type B = { sections?: { name: string; marks_each: number; questions: { q: string; answer: string; marks?: number }[] }[]; items?: { when: string; topic: string; objectives: string; activities: string; homework: string }[] };
  const b = (r.body ?? {}) as B;
  let key: { a: number; why: string }[] = [], attempts: { score: number; total: number; students: { full_name: string } }[] = [];
  if (kind === "test") {
    key = ((await sb.from("mcq_keys").select("answers").eq("test_id", id).maybeSingle()).data?.answers ?? []) as typeof key;
    attempts = ((await sb.from("mcq_attempts").select("score,total,students(full_name)").eq("test_id", id)).data ?? []) as unknown as typeof attempts;
  }
  return (
    <>
      <PageHeader title={r.title} sub={`Class ${cls.name}-${cls.section}${sub ? ` · ${sub}` : ""}`}><LinkBtn href="/academics" ghost>Back</LinkBtn><PrintButton /></PageHeader>
      <Card className="space-y-3">
        {kind === "paper" && b.sections?.map((s, i) => <div key={i}><h3 className="font-semibold">{s.name}</h3><ol className="ml-5 list-decimal space-y-2 text-sm">{s.questions.map((q, j) => <li key={j}>{q.q} <span className="text-mute">[{q.marks ?? s.marks_each}]</span><div className="text-xs text-teal-700 print:hidden dark:text-teal-300">Answer: {q.answer}</div></li>)}</ol></div>)}
        {kind === "plan" && b.items?.map((it, i) => <div key={i} className="rounded border border-line p-3 text-sm"><b>{it.when} · {it.topic}</b><p>{it.objectives}</p><p className="text-mute">{it.activities}</p>{it.homework && <p>Homework: {it.homework}</p>}</div>)}
        {kind === "test" && (r.questions as { q: string; options: string[] }[]).map((q, i) => <div key={i} className="text-sm"><b>{i + 1}. {q.q}</b><ul className="ml-5 list-[upper-alpha]">{q.options.map((o, j) => <li key={j} className={key[i]?.a === j ? "font-semibold text-teal-700 dark:text-teal-300" : ""}>{o}</li>)}</ul>{key[i]?.why && <div className="text-xs text-mute">{key[i].why}</div>}</div>)}
      </Card>
      {kind === "test" && <Card className="mt-4"><h2 className="mb-2 font-semibold">Results</h2><Table head={["Student", "Score"]} empty={attempts.length ? undefined : "Nobody has taken it yet."}>{attempts.map((a, i) => <tr key={i}><td>{a.students.full_name}</td><td>{a.score}/{a.total}</td></tr>)}</Table></Card>}
    </>
  );
}
