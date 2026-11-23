import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import { askJson } from "@/lib/ai";
import { aiStaff, aiFail } from "@/lib/ai-route";

export const maxDuration = 60;
const Out = z.object({ entries: z.array(z.object({
  subject: z.string(), classwork_en: z.string().catch(""), classwork_ur: z.string().catch(""), homework_en: z.string().catch(""), homework_ur: z.string().catch(""),
})).catch([]) });
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function POST(req: Request) {
  const g = await aiStaff("diary", "add"); if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { class_id?: string; text?: string };
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!b.class_id || text.length < 5) return NextResponse.json({ error: "Say or type what was taught and the homework." }, { status: 400 });
  const sb = await supabase();
  const { data: subs } = await sb.from("subjects").select("id,name").eq("class_id", b.class_id);   // RLS limits a teacher to their own classes
  if (!subs?.length) return NextResponse.json({ error: "This class has no subjects yet." }, { status: 400 });
  try {
    const out = await askJson(Out, {
      who: g.p.id, maxOutputTokens: 4000,
      system: "You turn a teacher's spoken or typed account of the day (English, Urdu, or Roman Urdu) into a school diary entry for parents. " +
        `The class's subjects are: ${subs.map((s) => s.name).join(", ")}. Write one entry ONLY for each subject the teacher actually mentions (if only one subject is mentioned, return exactly one entry), using exactly one of those subject names. ` +
        "For each, give classwork (what was taught) and homework (what to do at home), each in clear simple English AND in natural, respectful Urdu script. Use an empty string where nothing was said. Never invent topics, pages, or deadlines. " +
        'Reply with ONLY JSON: {"entries":[{"subject":"Maths","classwork_en":"","classwork_ur":"","homework_en":"","homework_ur":""}]}',
      user: text,
    });
    // Never keep an entry for a subject the teacher did not mention. (If they spoke Urdu script we cannot match names, so the review step is the check.)
    const heard = norm(text), urdu = /[\u0600-\u06FF]/.test(text);
    out.entries = out.entries.filter((e) => urdu || heard.includes(norm(e.subject)) || subs.some((s) => norm(s.name) === norm(e.subject) && heard.includes(norm(s.name).slice(0, 4))));
    const entries = out.entries.map((e) => { const hit = subs.find((s) => norm(s.name) === norm(e.subject)) ?? subs.find((s) => norm(s.name).includes(norm(e.subject)) || norm(e.subject).includes(norm(s.name))); return hit ? { ...e, subject_id: hit.id, subject: hit.name } : null; }).filter(Boolean);
    return NextResponse.json({ entries, skipped: out.entries.length - entries.length });
  } catch (e) { return aiFail(e); }
}
