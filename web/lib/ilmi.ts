import "server-only";
import { z } from "zod";
import { supabase } from "./supabase/server";
import { askJson } from "./ai";
import { can, activeCampus, type Profile } from "./auth";
import { saveAttendance } from "./attendance";

// Ilmi: the assistant inside Schoolwell. The AI only works out WHAT the person wants (an "intent"); all lookups, names and changes are done here,
// under the person's own permissions, and nothing is changed until they press Confirm.

const strs = z.array(z.union([z.string(), z.number()]).transform(String)).optional().catch(undefined);
const Intent = z.object({
  reply: z.string().optional().catch(undefined),
  intent: z.enum(["none", "mark_attendance", "low_attendance", "post_notice", "suggest_cover"]).catch("none"),
  class_name: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined),
  date: z.string().optional().catch(undefined),
  absent: strs, late: strs, leave: strs,
  threshold: z.coerce.number().optional().catch(undefined),
  notice: z.object({ title: z.string(), body: z.string(), audience: z.string().optional().catch(undefined) }).optional().catch(undefined),
  teacher: z.string().optional().catch(undefined),
});

export type Proposal =
  | { kind: "attendance"; classId: string; date: string; marks: Record<string, string>; summary: string }
  | { kind: "notice"; title: string; body: string; audience: "all" | "staff" | "parents"; summary: string };
export type IlmiResult = { reply: string; proposal?: Proposal };

type Person = { token: string; id: string; name: string; classId?: string };
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clsKey = (s: string) => norm(s).replace(/\bclass\b/g, "").replace(/\s+/g, "");
const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** Replaces known names in the message with codes, so names are never sent to the AI service. */
function tokenize(text: string, people: Person[]) {
  let out = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    out = out.replace(re, p.token);
  }
  return out;
}
const untokenize = (text: string, people: Person[]) => text.replace(/\{([ST]\d+)\}/g, (m, t) => people.find((p) => p.token === `{${t}}`)?.name ?? m);

function pick<T extends { full_name: string }>(ref: string, pool: T[], people: Person[]): { hit?: T; problem?: string } {
  const tok = /^\{?([ST]\d+)\}?$/.exec(ref.trim());
  if (tok) { const id = people.find((p) => p.token === `{${tok[1]}}`)?.id; const hit = pool.find((x) => (x as unknown as { id: string }).id === id); return hit ? { hit } : { problem: `${people.find((p) => p.token === `{${tok[1]}}`)?.name ?? ref} is not in that class` }; }
  const q = norm(ref); if (!q) return {};
  let m = pool.filter((x) => norm(x.full_name) === q);
  if (!m.length) m = pool.filter((x) => norm(x.full_name).split(" ")[0] === q);
  if (!m.length) m = pool.filter((x) => norm(x.full_name).includes(q));
  if (m.length === 1) return { hit: m[0] };
  return { problem: m.length ? `“${ref}” could be ${m.map((x) => x.full_name).join(" or ")}` : `I couldn't find “${ref}” in that class` };
}

export async function ilmi(p: Profile, message: string, today: string): Promise<IlmiResult> {
  const sb = await supabase();
  const [{ data: stu }, { data: stf }, { data: classes }] = await Promise.all([
    sb.from("students").select("id,full_name,class_id").eq("status", "active").limit(3000),
    sb.from("staff").select("id,full_name").limit(500),
    sb.from("classes").select("id,name,section"),
  ]);
  const people: Person[] = [
    ...(stu ?? []).map((s, i) => ({ token: `{S${i + 1}}`, id: s.id, name: s.full_name, classId: s.class_id as string })),
    ...(stf ?? []).map((s, i) => ({ token: `{T${i + 1}}`, id: s.id, name: s.full_name })),
  ];
  const classLabel = (c: { name: string; section: string }) => `${c.name}-${c.section}`;
  const out = await askJson(Intent, {
    who: p.id, maxOutputTokens: 1500,
    system: `You are Ilmi, the assistant inside a school management system. You NEVER change anything yourself: you work out what the staff member wants and return it as JSON; the system prepares it and a person confirms. Today is ${today}. ` +
      `Classes: ${(classes ?? []).map(classLabel).join(", ") || "none yet"}. People's names in the message were replaced by codes like {S12} (student) or {T3} (teacher): keep codes exactly as given. ` +
      "Choose ONE intent. mark_attendance: marking a class present except some children (class_name, optional date as YYYY-MM-DD, absent/late/leave as lists of codes or names). low_attendance: students below an attendance percentage (optional class_name, threshold default 75). " +
      "post_notice: write a clear, polite notice (notice.title, notice.body, audience all|staff|parents). suggest_cover: arrange cover for an absent teacher (teacher code or name, optional date). " +
      "none: greetings, general questions, or anything you cannot do (for example homework entries are not available yet): then put a short helpful answer in reply and say honestly what you can do. " +
      'Reply with ONLY JSON like {"intent":"mark_attendance","class_name":"8-A","date":"2026-01-05","absent":["{S3}"],"late":[],"leave":[],"reply":"short friendly sentence"}.',
    user: tokenize(message, people),
  });
  const fix = (t?: string) => untokenize(t ?? "", people);
  const findClass = (q?: string) => {
    if (!q) return { problem: "Which class? For example “Class 8-A”." } as const;
    const k = clsKey(q), exact = (classes ?? []).filter((c) => clsKey(classLabel(c)) === k || clsKey(c.name + c.section) === k);
    const m = exact.length ? exact : (classes ?? []).filter((c) => clsKey(classLabel(c)).includes(k));
    return m.length === 1 ? { cls: m[0] } : ({ problem: m.length ? `Which one: ${m.map(classLabel).join(" or ")}?` : `I couldn't find a class called “${q}”.` } as const);
  };

  if (out.intent === "mark_attendance") {
    if (!(await can("attendance", "add"))) return { reply: "You don't have permission to mark attendance." };
    const c = findClass(out.class_name); if ("problem" in c) return { reply: c.problem as string };
    const pool = (stu ?? []).filter((s) => s.class_id === c.cls.id);
    if (!pool.length) return { reply: `${classLabel(c.cls)} has no students yet.` };
    const marks: Record<string, string> = Object.fromEntries(pool.map((s) => [s.id, "P"]));
    const names: Record<string, string[]> = { A: [], L: [], LV: [] };
    const problems: string[] = [];
    for (const [code, list] of [["A", out.absent], ["L", out.late], ["LV", out.leave]] as const)
      for (const ref of list ?? []) { const r = pick(ref, pool, people); if (r.hit) { marks[r.hit.id] = code; names[code].push(r.hit.full_name); } else if (r.problem) problems.push(r.problem); }
    if (problems.length) return { reply: `I need a little help: ${problems.join("; ")}. Please say it again with the full name.` };
    const date = isoDate(out.date) ?? today;
    const parts = [names.A.length ? `absent: ${names.A.join(", ")}` : "", names.L.length ? `late: ${names.L.join(", ")}` : "", names.LV.length ? `on leave: ${names.LV.join(", ")}` : ""].filter(Boolean);
    const present = Object.values(marks).filter((v) => v === "P").length;
    return { reply: `I've prepared attendance for ${classLabel(c.cls)} on ${date}. Please check it and press Confirm.`,
      proposal: { kind: "attendance", classId: c.cls.id, date, marks, summary: `${classLabel(c.cls)} · ${date} · ${present} present${parts.length ? " · " + parts.join(" · ") : ""}` } };
  }

  if (out.intent === "low_attendance") {
    if (!(await can("attendance"))) return { reply: "You don't have access to attendance." };
    let classId: string | undefined, label = "all your classes";
    if (out.class_name) { const c = findClass(out.class_name); if ("problem" in c) return { reply: c.problem as string }; classId = c.cls.id; label = classLabel(c.cls); }
    const limit = Math.min(100, Math.max(1, out.threshold ?? 75));
    let q = sb.from("attendance").select("student_id,status,class_id").limit(50000); if (classId) q = q.eq("class_id", classId);
    const { data } = await q;
    const agg = new Map<string, { p: number; n: number }>();
    for (const r of data ?? []) { const a = agg.get(r.student_id) ?? { p: 0, n: 0 }; a.n++; if (r.status === "P") a.p++; agg.set(r.student_id, a); }
    const low = [...agg.entries()].filter(([, a]) => a.n >= 3 && (a.p / a.n) * 100 < limit).map(([id, a]) => ({ s: (stu ?? []).find((x) => x.id === id), pct: Math.round((a.p / a.n) * 100) })).filter((x) => x.s).sort((a, b) => a.pct - b.pct);
    if (!low.length) return { reply: `Nobody in ${label} is below ${limit}% (students need at least 3 days recorded to be counted).` };
    const cl = (id: string) => classLabel((classes ?? []).find((c) => c.id === id) ?? { name: "?", section: "" });
    return { reply: `Below ${limit}% attendance in ${label} (${low.length}):\n` + low.slice(0, 40).map((x) => `• ${x.s!.full_name} (${cl(x.s!.class_id)}): ${x.pct}%`).join("\n") };
  }

  if (out.intent === "post_notice") {
    if (!(await can("notices", "add"))) return { reply: "You don't have permission to post notices." };
    const n = out.notice; if (!n?.title || !n.body) return { reply: "What should the notice say?" };
    const audience = (["all", "staff", "parents"].includes(n.audience ?? "") ? n.audience : "all") as "all" | "staff" | "parents";
    const title = fix(n.title).slice(0, 150), body = fix(n.body).slice(0, 2000);
    return { reply: "I've drafted this notice. Please read it and press Confirm to post it.", proposal: { kind: "notice", title, body, audience, summary: `${title} — ${body} (for ${audience})` } };
  }

  if (out.intent === "suggest_cover") {
    if (!(await can("timetable"))) return { reply: "You don't have access to the timetable." };
    const t = pick(out.teacher ?? "", (stf ?? []).map((s) => ({ ...s })), people);
    if (!t.hit) return { reply: t.problem ?? "Which teacher is away?" };
    const date = isoDate(out.date) ?? today; const day = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    if (day > 5) return { reply: `${date} is a Sunday: there are no periods to cover.` };
    const [{ data: slots }, { data: absent }, { data: allStaff }] = await Promise.all([
      sb.from("timetable").select("period,day,classes(name,section),subjects(name,teacher_id)").eq("day", day).order("period"),
      sb.from("staff_attendance").select("staff_id,status").eq("date", date).in("status", ["A", "L"]),
      sb.from("staff").select("id,full_name").neq("status", "resigned"),
    ]);
    type Slot = { period: number; classes: { name: string; section: string }; subjects: { name: string; teacher_id: string | null } };
    const all = (slots ?? []) as unknown as Slot[];
    const mine = all.filter((s) => s.subjects?.teacher_id === t.hit!.id);
    if (!mine.length) return { reply: `${t.hit.full_name} has no periods on ${date}, so no cover is needed.` };
    const away = new Set([t.hit.id, ...(absent ?? []).map((a) => a.staff_id)]);
    const lines = mine.map((s) => {
      const busy = new Set(all.filter((x) => x.period === s.period).map((x) => x.subjects?.teacher_id));
      const free = (allStaff ?? []).filter((x) => !busy.has(x.id) && !away.has(x.id)).map((x) => x.full_name);
      return `• Period ${s.period}: ${classLabel(s.classes)} (${s.subjects.name}) → ${free.length ? free.slice(0, 4).join(", ") : "no free teacher"}`;
    });
    return { reply: `Cover for ${t.hit.full_name} on ${date}. Free teachers for each period:\n${lines.join("\n")}\n(Suggestions only: arrange it with the teachers.)` };
  }
  return { reply: fix(out.reply) || "I can mark attendance, list students below an attendance percentage, draft notices and suggest cover for an absent teacher." };
}

/** Runs a confirmed proposal with the person's own permissions. The details are re-validated here, never trusted from the browser. */
export async function confirmProposal(p: Profile, raw: unknown): Promise<{ ok: boolean; message: string }> {
  const a = z.object({ kind: z.literal("attendance"), classId: z.string(), date: z.string(), marks: z.record(z.string(), z.string()) }).safeParse(raw);
  if (a.success) {
    if (!(await can("attendance", "add"))) return { ok: false, message: "You don't have permission to mark attendance." };
    const r = await saveAttendance(p, { date: a.data.date, class_id: a.data.classId, marks: a.data.marks });
    return r.ok ? { ok: true, message: `Attendance saved for ${r.saved} students.` } : { ok: false, message: r.error };
  }
  const n = z.object({ kind: z.literal("notice"), title: z.string().min(1).max(150), body: z.string().min(1).max(2000), audience: z.enum(["all", "staff", "parents"]) }).safeParse(raw);
  if (n.success) {
    if (!(await can("notices", "add"))) return { ok: false, message: "You don't have permission to post notices." };
    const campus = await activeCampus();
    const { error } = await (await supabase()).from("notices").insert({ school_id: p.school_id, campus_id: p.campus_id ? campus?.id ?? null : campus?.id ?? null, title: n.data.title, body: n.data.body, audience: n.data.audience, created_by: p.id });
    return error ? { ok: false, message: error.message } : { ok: true, message: "Notice posted." };
  }
  return { ok: false, message: "That request was not recognised." };
}
