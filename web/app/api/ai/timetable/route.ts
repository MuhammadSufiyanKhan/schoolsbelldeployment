import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import { askJson } from "@/lib/ai";
import { aiStaff, aiFail } from "@/lib/ai-route";
import { solve, type SClass } from "@/lib/timetable-solver";

export const maxDuration = 60;
const Rules = z.object({
  days: z.coerce.number().catch(6), periods_per_day: z.coerce.number().catch(7), max_same_subject_per_day: z.coerce.number().catch(2),
  weekly_periods: z.array(z.object({ subject: z.string(), periods: z.coerce.number() })).catch([]),
  subject_periods: z.array(z.object({ subject: z.string(), periods: z.array(z.coerce.number()) })).catch([]),
  teacher_unavailable: z.array(z.object({ teacher: z.string(), days: z.array(z.coerce.number()) })).catch([]),
});
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function POST(req: Request) {
  const g = await aiStaff("timetable", "add"); if ("res" in g) return g.res;
  const b = (await req.json().catch(() => ({}))) as { rules?: string; class_ids?: string[] };
  const ids = (b.class_ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60);
  if (!ids.length) return NextResponse.json({ error: "Choose at least one class." }, { status: 400 });
  const sb = await supabase();
  const [{ data: classes }, { data: subs }, { data: staff }] = await Promise.all([
    sb.from("classes").select("id,name,section").in("id", ids), sb.from("subjects").select("id,name,teacher_id,class_id").in("class_id", ids),
    sb.from("staff").select("id,full_name").neq("status", "resigned"),
  ]);
  if (!classes?.length) return NextResponse.json({ error: "Classes not found." }, { status: 400 });
  const codes = (staff ?? []).map((s, i) => ({ code: `{T${i + 1}}`, ...s }));   // teacher names never leave the server
  let rules = String(b.rules ?? "").slice(0, 1500);
  for (const t of [...codes].sort((a, c) => c.full_name.length - a.full_name.length)) rules = rules.replace(new RegExp(t.full_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi"), t.code);
  try {
    const r = rules.trim() ? await askJson(Rules, {
      who: g.p.id, maxOutputTokens: 2000,
      system: "You convert a school's timetable rules, written the way a person would tell a colleague, into numbers. Days are numbered Monday=0 … Saturday=5. Periods are numbered from 1. Teacher names appear as codes like {T3}: keep the codes. " +
        'Reply with ONLY JSON: {"days":6,"periods_per_day":7,"max_same_subject_per_day":2,"weekly_periods":[{"subject":"Maths","periods":6}],"subject_periods":[{"subject":"Maths","periods":[1,2]}],"teacher_unavailable":[{"teacher":"{T3}","days":[4]}]}. ' +
        "Only include what the rules actually say; use days 6 and periods_per_day 7 if not stated. subject_periods means that subject may ONLY be placed in those periods.",
      user: rules,
    }) : Rules.parse({});
    const subjectNames = new Set((subs ?? []).map((s) => s.name.toLowerCase()));
    const fixName = (n: string) => { const q = norm(n); return [...subjectNames].find((s) => norm(s) === q) ?? [...subjectNames].find((s) => norm(s).includes(q) || q.includes(norm(s))) ?? q; };
    const cfg = {
      days: Math.min(6, Math.max(1, r.days || 6)), periods: Math.min(10, Math.max(1, r.periods_per_day || 7)), maxPerDay: Math.min(4, Math.max(1, r.max_same_subject_per_day || 2)),
      weekly: Object.fromEntries(r.weekly_periods.map((w) => [fixName(w.subject), Math.max(0, Math.round(w.periods))])),
      allowed: Object.fromEntries(r.subject_periods.map((w) => [fixName(w.subject), w.periods.filter((p) => p >= 1 && p <= 10)])),
      teacherOff: Object.fromEntries(r.teacher_unavailable.map((t) => { const m = codes.find((c) => c.code === t.teacher.trim() || norm(c.full_name) === norm(t.teacher)); return m ? [m.id, t.days] : ["", []]; }).filter(([k]) => k)),
    };
    const sc: SClass[] = classes.map((c) => ({ id: c.id, label: `${c.name}-${c.section}`, subjects: (subs ?? []).filter((s) => s.class_id === c.id).map((s) => ({ id: s.id, name: s.name, teacher_id: s.teacher_id })) })).filter((c) => c.subjects.length);
    if (!sc.length) return NextResponse.json({ error: "These classes have no subjects yet." }, { status: 400 });
    const out = solve(sc, cfg);
    const name = (id: string) => (staff ?? []).find((s) => s.id === id)?.full_name;
    return NextResponse.json({
      cfg: { days: cfg.days, periods: cfg.periods, maxPerDay: cfg.maxPerDay, weekly: cfg.weekly, allowed: cfg.allowed, off: (Object.entries(cfg.teacherOff) as [string, number[]][]).map(([id, d]) => `${name(id)}: ${d.join(",")}`) },
      classes: sc.map((c) => ({ id: c.id, label: c.label, subjects: Object.fromEntries(c.subjects.map((s) => [s.id, { name: s.name, teacher: s.teacher_id ? name(s.teacher_id) ?? "" : "" }])) })),
      placed: out.placed, unplaced: out.unplaced,
    });
  } catch (e) { return aiFail(e); }
}
