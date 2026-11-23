import "server-only";
import { supabase } from "./supabase/server";

export const STAGES = ["enquiry", "documents", "interview", "accepted", "rejected", "enrolled"] as const;
export const tone = (s: string) => (s === "enrolled" || s === "accepted" ? "ok" : s === "rejected" ? "bad" : "warn") as "ok" | "bad" | "warn";

/** Same child already known: same name and date of birth among students or earlier enquiries. */
export async function findDuplicates(name: string, dob: string | null, ignoreAdmission?: string) {
  const sb = await supabase();
  const n = name.trim().replace(/[%_,()]/g, " ");
  if (!n || !dob) return [] as string[];
  const [s, a] = await Promise.all([
    sb.from("students").select("full_name,admission_no").ilike("full_name", n).eq("dob", dob),
    sb.from("admissions").select("id,applicant_name,stage").ilike("applicant_name", n).eq("dob", dob),
  ]);
  return [...(s.data ?? []).map((x) => `student ${x.full_name} (${x.admission_no})`), ...(a.data ?? []).filter((x) => x.id !== ignoreAdmission).map((x) => `enquiry ${x.applicant_name} (${x.stage})`)];
}
