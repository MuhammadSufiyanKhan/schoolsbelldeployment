import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import { askJson, type Image } from "@/lib/ai";
import { aiStaff, aiFail } from "@/lib/ai-route";

export const maxDuration = 60;
const Paper = z.object({ title: z.string().catch("Question paper"), sections: z.array(z.object({ name: z.string().catch(""), marks_each: z.coerce.number().catch(1), questions: z.array(z.object({ q: z.string(), answer: z.string().catch(""), marks: z.coerce.number().optional().catch(undefined) })) })).min(1) });
const Plan = z.object({ title: z.string().catch("Lesson plan"), items: z.array(z.object({ when: z.string().catch(""), topic: z.string(), objectives: z.string().catch(""), activities: z.string().catch(""), homework: z.string().catch("") })).min(1) });
const Test = z.object({ title: z.string().catch("MCQ test"), questions: z.array(z.object({ q: z.string(), options: z.array(z.string()).min(2).max(6), answer: z.coerce.number().int(), explanation: z.string().catch("") })).min(1) });

export async function POST(req: Request) {
  const g = await aiStaff("academics", "add"); if ("res" in g) return g.res;
  const fd = await req.formData().catch(() => null); if (!fd) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const kind = String(fd.get("kind")), classId = String(fd.get("class_id") ?? ""), subjectId = String(fd.get("subject_id") ?? "");
  const text = String(fd.get("text") ?? "").slice(0, 6000), extra = String(fd.get("extra") ?? "").slice(0, 600);
  const count = Math.min(40, Math.max(3, Number(fd.get("count")) || 10));
  if (!["paper", "plan", "test"].includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  const sb = await supabase();
  const [{ data: cls }, { data: sub }] = await Promise.all([sb.from("classes").select("name,section").eq("id", classId).maybeSingle(), subjectId ? sb.from("subjects").select("name").eq("id", subjectId).maybeSingle() : Promise.resolve({ data: null })]);
  if (!cls) return NextResponse.json({ error: "Choose a class." }, { status: 400 });
  const images: Image[] = [];
  for (const f of fd.getAll("files")) {
    if (!(f instanceof File) || !f.size) continue;
    if (images.length >= 6 || f.size > 8 * 1024 * 1024 || !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) return NextResponse.json({ error: "Use up to 6 photos or PDFs, each under 8 MB." }, { status: 400 });
    images.push({ data: Buffer.from(await f.arrayBuffer()), mediaType: f.type });
  }
  if (!text.trim() && !images.length) return NextResponse.json({ error: "Type the chapters or topics, or add photos / a PDF of the pages." }, { status: 400 });
  const ctx = `Class ${cls.name}-${cls.section}${sub ? `, subject ${sub.name}` : ""}. Material or chapters: ${text || "(see the attached pages)"}. ${extra}`;
  const base = "Use ONLY the given material and the normal school curriculum for that class. Be accurate: never invent facts. ";
  try {
    if (kind === "paper") {
      const out = await askJson(Paper, { who: g.p.id, maxOutputTokens: 7000, images,
        system: base + `You write a school exam paper with an answer key for the teacher to check. About ${count} questions in total, grouped in sections (for example MCQs, short answers, long answers) with marks for each question. ` +
          'Reply with ONLY JSON: {"title":"...","sections":[{"name":"Section A: MCQs","marks_each":1,"questions":[{"q":"...","answer":"...","marks":1}]}]}. Put the model answer in "answer".', user: ctx });
      return NextResponse.json({ kind, title: out.title, body: out });
    }
    if (kind === "plan") {
      const out = await askJson(Plan, { who: g.p.id, maxOutputTokens: 7000, images,
        system: base + "You write a lesson plan for a teacher. If the extra instruction says year, give a year plan by month (about 10-12 items); if month, a plan by week (4-5 items); otherwise a daily plan by lesson (about 5-8 items). " +
          'Each item: when (month/week/day label), topic, objectives, activities, homework. Reply with ONLY JSON: {"title":"...","items":[{"when":"","topic":"","objectives":"","activities":"","homework":""}]}', user: ctx });
      return NextResponse.json({ kind, title: out.title, body: out });
    }
    const out = await askJson(Test, { who: g.p.id, maxOutputTokens: 7000, images,
      system: base + `You write exactly ${count} multiple-choice questions with 4 options each, one correct answer ("answer" is the 0-based index of the correct option), and a one-line explanation. Questions must be answerable from the material. ` +
        'Reply with ONLY JSON: {"title":"...","questions":[{"q":"...","options":["A","B","C","D"],"answer":0,"explanation":"..."}]}', user: ctx });
    const qs = out.questions.filter((q) => q.answer >= 0 && q.answer < q.options.length);
    if (!qs.length) return NextResponse.json({ error: "The AI did not return usable questions. Please try again." }, { status: 502 });
    return NextResponse.json({ kind, title: out.title, body: { ...out, questions: qs } });
  } catch (e) { return aiFail(e); }
}
