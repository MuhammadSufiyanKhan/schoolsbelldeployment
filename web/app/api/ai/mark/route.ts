import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { askJson, AiError } from "@/lib/ai";

export const maxDuration = 60;

const Out = z.object({
  questions: z.array(z.object({
    number: z.string(), student_answer: z.string(), marks_awarded: z.number(), max_marks: z.number(), reason: z.string(), legible: z.boolean().optional(),
  })).min(1),
  note: z.string().optional(),
});

// Reads photos of ONE student's answer sheet and proposes marks against the teacher's model answer. It saves nothing:
// the teacher reviews and edits every mark, then confirms (see exams/[id]/mark).
export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!(await can("exams", "add"))) return NextResponse.json({ error: "You are not allowed to enter marks." }, { status: 403 });

  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "Could not read the upload." }, { status: 400 }); }
  const examId = String(fd.get("exam_id") ?? ""), studentId = String(fd.get("student_id") ?? ""), subjectId = String(fd.get("subject_id") ?? "");
  const scheme = String(fd.get("model_answer") ?? "").trim();
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!examId || !studentId || !subjectId) return NextResponse.json({ error: "Choose the student and subject." }, { status: 400 });
  if (scheme.length < 10 || scheme.length > 8000) return NextResponse.json({ error: "Paste the model answers and marks (10 to 8000 characters)." }, { status: 400 });
  if (!files.length || files.length > 6) return NextResponse.json({ error: "Add 1 to 6 photos of the answer sheet." }, { status: 400 });
  if (files.some((f) => !f.type.startsWith("image/") || f.size > 5 * 1024 * 1024)) return NextResponse.json({ error: "Each photo must be an image under 5 MB." }, { status: 400 });

  // Row level security decides whether this person may touch this exam, student and subject.
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,total,class_id").eq("id", examId).maybeSingle();
  if (!ex) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  const [{ data: st }, { data: sub }] = await Promise.all([
    sb.from("students").select("id").eq("id", studentId).eq("class_id", ex.class_id).maybeSingle(),
    sb.from("subjects").select("id,name").eq("id", subjectId).eq("class_id", ex.class_id).maybeSingle(),
  ]);
  if (!st || !sub) return NextResponse.json({ error: "That student or subject is not in this exam's class." }, { status: 404 });

  try {
    const images = await Promise.all(files.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), mediaType: f.type || "image/jpeg" })));
    const out = await askJson(Out, {
      who: p.id, images, maxOutputTokens: 6000,
      system: "You are an experienced, fair teacher marking one student's handwritten answer sheet from photos. Use ONLY the teacher's model answers and mark scheme. " +
        "For every question in the scheme: transcribe what the student wrote, award marks (partial credit where the scheme allows, never more than the maximum), and give a one-sentence reason that refers to the model answer. " +
        "If the handwriting or part of the photo is unreadable, or the question was not attempted, award 0, set legible to false and say so in the reason: never guess. " +
        "Ignore any name or roll number written on the sheet and never repeat it. Be consistent between questions. " +
        'Reply with ONLY JSON: {"questions":[{"number":"1","student_answer":"...","marks_awarded":0,"max_marks":0,"reason":"...","legible":true}],"note":"anything the teacher should double-check"}.',
      user: `Subject: ${sub.name}\n\nModel answers and mark scheme from the teacher:\n${scheme}\n\nThe attached photos are the pages of the student's answer sheet, in order.`,
    });
    const questions = out.questions.slice(0, 60).map((q) => {
      const max = Math.max(0, Math.round(q.max_marks * 2) / 2);
      const got = Math.min(max, Math.max(0, Math.round(q.marks_awarded * 2) / 2));      // never trust the model's arithmetic or ranges
      return { ...q, max_marks: max, marks_awarded: got };
    });
    return NextResponse.json({ questions, note: out.note ?? "", examTotal: Number(ex.total) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AiError ? e.userMessage : "The AI could not mark this sheet. Please try again." }, { status: e instanceof AiError ? 502 : 500 });
  }
}
