import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { saveAttendance } from "@/lib/attendance";
import FaceScan from "@/components/face-scan";
import { Card, PageHeader, LinkBtn, Flash, first, type SP } from "@/components/ui";

async function saveFace(fd: FormData) {
  "use server";
  const p = await guard("attendance", "add");
  let marks: Record<string, string> = {};
  try { marks = JSON.parse(String(fd.get("marks"))); } catch { /* handled */ }
  const classId = String(fd.get("class_id"));
  const r = await saveAttendance(p, { date: String(fd.get("date")), class_id: classId, marks }, "face");
  redirect(`/attendance/face?class=${classId}&msg=${encodeURIComponent(r.ok ? `Saved attendance for ${r.saved} students.` : r.error)}`);
}
export default async function FaceAttendance({ searchParams }: { searchParams: SP }) {
  await guard("attendance", "add");
  const sp = await searchParams; const sb = await supabase();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section");
  const classId = first(sp.class) ?? classes?.[0]?.id ?? "";
  const [{ data: studs }, { data: cons }, { data: tpl }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", classId).eq("status", "active").order("full_name"),
    sb.from("face_consents").select("student_id,withdrawn_on"), sb.from("face_templates").select("student_id,descriptor").eq("class_id", classId),
  ]);
  const ok = new Set((cons ?? []).filter((c) => !c.withdrawn_on).map((c) => c.student_id));
  const t = new Map((tpl ?? []).map((x) => [x.student_id, x.descriptor as number[]]));
  return (
    <>
      <PageHeader title="Face attendance" sub="Move one phone slowly across the class. Only children with consent on record are recognised."><LinkBtn href="/attendance" ghost>Back</LinkBtn><LinkBtn href={`/attendance/face/enrol?class=${classId}`} ghost>Consent & enrol faces</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-4 flex items-end gap-2"><label className="text-sm">Class<select name="class" defaultValue={classId}>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></label><button className="rounded-lg border border-line px-3 py-2 text-sm">Open</button></form>
        {classId && <FaceScan key={classId} classId={classId} save={saveFace} students={(studs ?? []).map((s) => ({ id: s.id, name: s.full_name, consent: ok.has(s.id), template: ok.has(s.id) ? t.get(s.id) ?? null : null }))} />}
      </Card>
      <p className="mt-3 text-xs text-mute">Faces are recognised on this device. No photo is sent anywhere or stored: only a numeric face template, kept for children whose guardians gave consent. Withdrawing consent deletes the template.</p>
    </>
  );
}
