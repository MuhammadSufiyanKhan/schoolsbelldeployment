import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai";
import PhotoMarking from "@/components/photo-marking";
import { Card, PageHeader, LinkBtn, Flash, str, first, type SP } from "@/components/ui";

type Row = { number: string; marks_awarded: number; max_marks: number; reason: string; student_answer?: string };

// Runs only when the teacher presses "Confirm and save marks". The AI only proposes; this is where a person's decision is recorded.
async function saveAiMarks(examId: string, fd: FormData) {
  "use server";
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("total,campus_id,class_id,published").eq("id", examId).maybeSingle();
  if (!ex) redirect("/exams");
  if (ex.published && !(await can("exams", "approve"))) redirect(`/exams/${examId}/mark?msg=Results+are+published+and+locked`);
  let rows: Row[] = [];
  try { rows = JSON.parse(str(fd, "rows")); } catch { redirect(`/exams/${examId}/mark?msg=Could+not+read+the+marks`); }
  rows = rows.slice(0, 60).map((r) => ({ ...r, max_marks: Math.max(0, Number(r.max_marks) || 0), marks_awarded: Math.max(0, Number(r.marks_awarded) || 0) })).map((r) => ({ ...r, marks_awarded: Math.min(r.marks_awarded, r.max_marks) }));
  const max = rows.reduce((a, r) => a + r.max_marks, 0), got = rows.reduce((a, r) => a + r.marks_awarded, 0);
  if (!rows.length || !max) redirect(`/exams/${examId}/mark?msg=Nothing+to+save`);
  const obtained = Math.round((got / max) * Number(ex.total) * 2) / 2;
  const reason = ("AI-assisted, teacher-confirmed. " + rows.map((r) => `Q${r.number} ${r.marks_awarded}/${r.max_marks}: ${String(r.reason).slice(0, 160)}`).join(" | ")).slice(0, 4000);
  const { error } = await sb.from("marks").upsert({
    exam_id: examId, student_id: str(fd, "student_id"), subject_id: str(fd, "subject_id"), school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, obtained, reason, source: "ai",
  }, { onConflict: "exam_id,student_id,subject_id" });
  redirect(`/exams/${examId}/mark?msg=${error ? encodeURIComponent(error.message) : encodeURIComponent(`Saved ${obtained} / ${ex.total}. Marked by AI, confirmed by you.`)}`);
}

export default async function MarkFromPhotos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("exams", "add");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,class_id").eq("id", id).maybeSingle();
  if (!ex) notFound();
  const [{ data: studs }, { data: subs }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active").order("full_name"),
    sb.from("subjects").select("id,name").eq("class_id", ex.class_id).order("name"),
  ]);
  return (
    <>
      <PageHeader title={`Mark from photos · ${ex.name}`} sub="Photograph a student's answer pages. The AI reads the handwriting and proposes marks with a reason for each. You check and confirm."><LinkBtn href={`/exams/${id}`} ghost>Back to marks</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      {!aiReady() ? <Card><p className="text-sm">AI is not set up yet. Add <code>GEMINI_API_KEY</code> in the hosting settings.</p></Card> :
        !studs?.length || !subs?.length ? <Card><p className="text-sm text-mute">This exam's class needs students and subjects first.</p></Card> :
        <Card>
          <PhotoMarking examId={id} students={(studs ?? []).map((s) => ({ id: s.id, name: s.full_name }))} subjects={subs ?? []} save={saveAiMarks.bind(null, id)} />
          <p className="mt-4 text-xs text-mute">Powered by Google Gemini (free tier). The photos are sent to Google only for this marking. Do not include anything that identifies the student: write marks against the roll number on paper if needed.</p>
        </Card>}
    </>
  );
}
