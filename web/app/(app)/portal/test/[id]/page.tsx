import { notFound, redirect } from "next/navigation";
import { requireFamily } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { Card, PageHeader, LinkBtn, Btn, Flash, first, type SP } from "@/components/ui";

async function submit(testId: string, studentId: string, fd: FormData) {
  "use server";
  await requireFamily();
  const sb = await supabase();
  // RLS: these only return rows for this parent's own children and published tests of their class
  const [{ data: t }, { data: kid }] = await Promise.all([sb.from("mcq_tests").select("id,class_id,questions").eq("id", testId).maybeSingle(), sb.from("students").select("id,class_id,school_id,campus_id").eq("id", studentId).maybeSingle()]);
  if (!t || !kid || kid.class_id !== t.class_id) redirect("/portal");
  const db = admin();   // the answer key is hidden from parents by RLS, so the server marks it
  const { data: k } = await db.from("mcq_keys").select("answers").eq("test_id", testId).maybeSingle();
  const key = (k?.answers ?? []) as { a: number }[];
  const qs = t.questions as { q: string; options: string[] }[];
  const given = qs.map((_, i) => { const v = fd.get(`q${i}`); return v === null ? -1 : Number(v); });
  const score = given.filter((g, i) => g === key[i]?.a).length;
  const { error } = await db.from("mcq_attempts").insert({ test_id: testId, student_id: studentId, school_id: kid.school_id, campus_id: kid.campus_id, class_id: kid.class_id, score, total: qs.length, answers: given });
  redirect(`/portal/test/${testId}?student=${studentId}&msg=${error ? "Already+taken" : "Submitted"}`);
}

export default async function TakeTest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireFamily();
  const { id } = await params; const sp = await searchParams; const studentId = first(sp.student) ?? "";
  const sb = await supabase();
  const [{ data: t }, { data: kid }, { data: at }] = await Promise.all([
    sb.from("mcq_tests").select("id,title,questions,class_id").eq("id", id).maybeSingle(),
    sb.from("students").select("id,full_name,class_id").eq("id", studentId).maybeSingle(),
    sb.from("mcq_attempts").select("score,total").eq("test_id", id).eq("student_id", studentId).maybeSingle(),
  ]);
  if (!t || !kid || kid.class_id !== t.class_id) notFound();
  const qs = t.questions as { q: string; options: string[] }[];
  return (
    <>
      <PageHeader title={t.title} sub={kid.full_name}><LinkBtn href="/portal" ghost>Back</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      {at ? <Card><p className="text-lg font-bold">Score: {at.score} / {at.total}</p><p className="text-sm text-mute">This test can be taken once.</p></Card> : (
        <form action={submit.bind(null, id, studentId)} className="space-y-4">
          {qs.map((q, i) => <Card key={i}><p className="mb-2 font-medium">{i + 1}. {q.q}</p><div className="space-y-1 text-sm">{q.options.map((o, j) => <label key={j} className="flex items-center gap-2"><input type="radio" name={`q${i}`} value={j} />{o}</label>)}</div></Card>)}
          <Btn>Submit answers</Btn>
        </form>)}
    </>
  );
}
