import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { draftRemarks } from "@/lib/remarks";
import { z } from "zod";
import { askJson, aiReady, AiError } from "@/lib/ai";
import { Card, PageHeader, Btn, Flash, Badge, LinkBtn, first, type SP } from "@/components/ui";

async function context(examId: string) {
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,class_id,campus_id,total").eq("id", examId).maybeSingle();
  if (!ex) redirect("/exams");
  return { p, sb, ex };
}
async function draftAll(examId: string) {
  "use server";
  const { p, sb, ex } = await context(examId);
  const [{ data: studs }, { data: subs }, { data: mk }, { data: att }, { data: have }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active"),
    sb.from("subjects").select("id,name").eq("class_id", ex.class_id),
    sb.from("marks").select("student_id,subject_id,obtained").eq("exam_id", examId),
    sb.from("attendance").select("student_id,status").eq("class_id", ex.class_id),
    sb.from("report_remarks").select("student_id,source").eq("exam_id", examId),
  ]);
  const manual = new Set((have ?? []).filter((r) => r.source === "manual").map((r) => r.student_id));   // never overwrite a teacher's own words
  const rows = [];
  for (const s of studs ?? []) {
    if (manual.has(s.id)) continue;
    const mine = (mk ?? []).filter((m) => m.student_id === s.id).map((m) => ({ name: subs?.find((u) => u.id === m.subject_id)?.name ?? "", pct: (Number(m.obtained) / Number(ex.total)) * 100 }));
    const pct = mine.length ? mine.reduce((a, b) => a + b.pct, 0) / mine.length : null;
    const sorted = [...mine].sort((a, b) => b.pct - a.pct);
    const a = (att ?? []).filter((x) => x.student_id === s.id);
    const d = draftRemarks({ name: s.full_name, pct, best: sorted[0]?.name, worst: sorted.at(-1)?.name, attendance: a.length ? (a.filter((x) => x.status === "P").length / a.length) * 100 : null });
    rows.push({ exam_id: examId, student_id: s.id, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, remark_en: d.en, remark_ur: d.ur, source: "template" });
  }
  if (rows.length) await sb.from("report_remarks").upsert(rows, { onConflict: "exam_id,student_id" });
  redirect(`/exams/${examId}/remarks?msg=Drafted+${rows.length}+remarks.+Please+read+and+edit+them.`);
}

// AI drafts. The AI never sees a student's name: it gets an anonymous reference, gender and numbers, and writes {NAME} where the
// first name belongs; the name is filled in here. Nothing a teacher has written themself is ever overwritten.
const RemarksOut = z.object({ remarks: z.array(z.object({ ref: z.string(), en: z.string(), ur: z.string() })) });
async function draftWithAI(examId: string) {
  "use server";
  const { p, sb, ex } = await context(examId);
  const [{ data: studs }, { data: subs }, { data: mk }, { data: att }, { data: have }] = await Promise.all([
    sb.from("students").select("id,full_name,gender").eq("class_id", ex.class_id).eq("status", "active").order("full_name"),
    sb.from("subjects").select("id,name").eq("class_id", ex.class_id),
    sb.from("marks").select("student_id,subject_id,obtained").eq("exam_id", examId),
    sb.from("attendance").select("student_id,status").eq("class_id", ex.class_id),
    sb.from("report_remarks").select("student_id,source").eq("exam_id", examId),
  ]);
  const manual = new Set((have ?? []).filter((r) => r.source === "manual").map((r) => r.student_id));
  const todo = (studs ?? []).filter((s) => !manual.has(s.id) && (mk ?? []).some((m) => m.student_id === s.id));
  if (!todo.length) redirect(`/exams/${examId}/remarks?msg=Enter+marks+first:+there+is+nothing+to+write+remarks+from`);
  const facts = todo.map((s, i) => {
    const mine = (mk ?? []).filter((m) => m.student_id === s.id).map((m) => ({ name: subs?.find((u) => u.id === m.subject_id)?.name ?? "?", pct: Math.round((Number(m.obtained) / Number(ex.total)) * 100) }));
    const overall = Math.round(mine.reduce((a, b) => a + b.pct, 0) / mine.length);
    const a = (att ?? []).filter((x) => x.student_id === s.id);
    return { s, line: `{"ref":"S${i + 1}","gender":"${s.gender === "M" ? "male" : "female"}","overall_percent":${overall},"subjects":${JSON.stringify(mine)},"attendance_percent":${a.length ? Math.round((a.filter((x) => x.status === "P").length / a.length) * 100) : "null"}}` };
  });
  const rows: Record<string, unknown>[] = [];
  try {
    for (let i = 0; i < facts.length; i += 10) {
      const chunk = facts.slice(i, i + 10);
      const out = await askJson(RemarksOut, {
        who: p.id, maxOutputTokens: 6000,
        system: "You write short, kind, honest report-card remarks for school students, in English and in Urdu. Each remark is 2 to 3 sentences, specific to the numbers given (strongest and weakest subjects, attendance if it is below 75%), encouraging but never invented or exaggerated. " +
          "Write {NAME} exactly where the child's first name belongs. Use the correct gender in English pronouns and in Urdu verb forms. Urdu must be natural, respectful Urdu in Urdu script. Do not mention marks as raw numbers more than once. " +
          'Reply with ONLY JSON: {"remarks":[{"ref":"S1","en":"...","ur":"..."}]} with one entry per student, using the same refs.',
        user: "Students (one JSON object per line):\n" + chunk.map((f) => f.line).join("\n"),
      });
      for (const r of out.remarks) {
        const f = chunk.find((c) => c.line.includes(`"ref":"${r.ref}"`));
        if (!f) continue;
        const first = f.s.full_name.split(" ")[0];
        rows.push({ exam_id: examId, student_id: f.s.id, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, remark_en: r.en.replaceAll("{NAME}", first), remark_ur: r.ur.replaceAll("{NAME}", first), source: "ai" });
      }
    }
  } catch (e) {
    redirect(`/exams/${examId}/remarks?msg=${encodeURIComponent(e instanceof AiError ? e.userMessage : "The AI could not write the remarks. Please try again.")}`);
  }
  if (rows.length) await sb.from("report_remarks").upsert(rows, { onConflict: "exam_id,student_id" });
  redirect(`/exams/${examId}/remarks?msg=${encodeURIComponent(`AI drafted ${rows.length} remarks. Please read and edit them before printing.`)}`);
}
async function saveAll(examId: string, fd: FormData) {
  "use server";
  const { p, sb, ex } = await context(examId);
  const ids = new Set<string>();
  for (const k of fd.keys()) { const m = /^en_([0-9a-f-]{36})$/i.exec(k); if (m) ids.add(m[1]); }
  const rows = [...ids].map((sid) => ({ exam_id: examId, student_id: sid, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, remark_en: String(fd.get(`en_${sid}`) ?? "").trim(), remark_ur: String(fd.get(`ur_${sid}`) ?? "").trim(), source: "manual" }));
  const { error } = await sb.from("report_remarks").upsert(rows, { onConflict: "exam_id,student_id" });
  redirect(`/exams/${examId}/remarks?msg=${error ? encodeURIComponent(error.message) : "Remarks+saved"}`);
}

export default async function Remarks({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("exams");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,class_id").eq("id", id).maybeSingle();
  if (!ex) notFound();
  const [{ data: studs }, { data: rem }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active").order("full_name"),
    sb.from("report_remarks").select("student_id,remark_en,remark_ur,source").eq("exam_id", id),
  ]);
  const by = new Map((rem ?? []).map((r) => [r.student_id, r]));
  const w = await can("exams", "add");
  return (
    <>
      <PageHeader title={`Remarks · ${ex.name}`} sub="English and Urdu. Drafts come from each student's marks and attendance; always read before printing.">
        <LinkBtn href={`/exams/${id}`} ghost>Back to marks</LinkBtn>{w && aiReady() && <form action={draftWithAI.bind(null, id)}><Btn>✨ Write with AI</Btn></form>}{w && <form action={draftAll.bind(null, id)}><Btn variant="ghost">Quick draft (no AI)</Btn></form>}
      </PageHeader>
      <Flash msg={first(sp.msg)} />
      <form action={saveAll.bind(null, id)} className="space-y-3">
        {(studs ?? []).map((s) => { const r = by.get(s.id); return (
          <Card key={s.id}><div className="mb-2 flex items-center gap-2"><b>{s.full_name}</b>{r && <Badge tone={r.source === "manual" ? "ok" : "warn"}>{r.source === "manual" ? "edited" : r.source === "ai" ? "AI draft" : "draft"}</Badge>}</div>
            <div className="grid gap-2 md:grid-cols-2"><textarea name={`en_${s.id}`} rows={3} defaultValue={r?.remark_en ?? ""} placeholder="English remark" disabled={!w} />
              <textarea name={`ur_${s.id}`} rows={3} dir="rtl" lang="ur" defaultValue={r?.remark_ur ?? ""} placeholder="اردو ریمارکس" disabled={!w} className="text-base leading-loose" /></div></Card>); })}
        {w && (studs?.length ?? 0) > 0 && <Btn>Save remarks</Btn>}
      </form>
    </>
  );
}
