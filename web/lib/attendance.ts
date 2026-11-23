import "server-only";
import { supabase } from "./supabase/server";
import type { Profile } from "./auth";

export const STATUSES = ["P", "A", "L", "LV"] as const;
export type AttendancePayload = { date: string; class_id: string; marks: Record<string, string> };

/** Saves one class's attendance for a day. Used by the form action and by the offline-sync endpoint.
 *  Row level security still decides whether this person may write these rows. */
export async function saveAttendance(p: Profile, input: AttendancePayload, method: "manual" | "face" = "manual"): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Invalid date" };
  const entries = Object.entries(input.marks ?? {});
  if (!entries.length || entries.length > 500) return { ok: false, error: "No attendance to save" };
  if (entries.some(([id, s]) => !/^[0-9a-f-]{36}$/i.test(id) || !(STATUSES as readonly string[]).includes(s))) return { ok: false, error: "Invalid attendance data" };
  const sb = await supabase();
  const { data: klass } = await sb.from("classes").select("campus_id").eq("id", input.class_id).maybeSingle();
  if (!klass) return { ok: false, error: "Class not found" };
  const rows = entries.map(([student_id, status]) => ({ student_id, date: input.date, school_id: p.school_id, campus_id: klass.campus_id, class_id: input.class_id, status, method }));
  const { error } = await sb.from("attendance").upsert(rows, { onConflict: "student_id,date" });
  return error ? { ok: false, error: error.message } : { ok: true, saved: rows.length };
}
