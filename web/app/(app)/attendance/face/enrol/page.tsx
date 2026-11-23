import { redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import FaceEnrol from "@/components/face-enrol";
import { Card, PageHeader, LinkBtn, Flash, Table, Badge, str, first, type SP } from "@/components/ui";

async function enrol(studentId: string, descriptor: number[]): Promise<{ ok: boolean; message: string }> {
  "use server";
  const p = await guard("attendance", "add");
  if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some((x) => typeof x !== "number" || !isFinite(x))) return { ok: false, message: "Invalid face data" };
  const sb = await supabase();
  const [{ data: s }, { data: c }] = await Promise.all([sb.from("students").select("class_id,campus_id").eq("id", studentId).maybeSingle(), sb.from("face_consents").select("withdrawn_on").eq("student_id", studentId).maybeSingle()]);
  if (!s) return { ok: false, message: "Student not found" };
  if (!c || c.withdrawn_on) return { ok: false, message: "No consent on record for this child" };   // the rule that matters most
  const { error } = await sb.from("face_templates").upsert({ student_id: studentId, school_id: p.school_id, campus_id: s.campus_id, class_id: s.class_id, descriptor, enrolled_at: new Date().toISOString() }, { onConflict: "student_id" });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Enrolled" };
}
async function giveConsent(classId: string, fd: FormData) {
  "use server";
  const p = await guard("students", "add");
  const sb = await supabase(); const sid = str(fd, "student_id"), by = str(fd, "given_by");
  const { data: s } = await sb.from("students").select("campus_id").eq("id", sid).maybeSingle();
  if (!s || !by) redirect(`/attendance/face/enrol?class=${classId}&msg=Enter+who+gave+consent`);
  await sb.from("face_consents").upsert({ student_id: sid, school_id: p.school_id, campus_id: s.campus_id, given_by: by, given_on: new Date().toISOString().slice(0, 10), withdrawn_on: null }, { onConflict: "student_id" });
  redirect(`/attendance/face/enrol?class=${classId}&msg=Consent+recorded`);
}
async function withdraw(classId: string, studentId: string) {
  "use server";
  await guard("students", "add"); const sb = await supabase();
  await sb.from("face_consents").update({ withdrawn_on: new Date().toISOString().slice(0, 10) }).eq("student_id", studentId);
  await sb.from("face_templates").delete().eq("student_id", studentId);   // withdrawing consent deletes the face template
  redirect(`/attendance/face/enrol?class=${classId}&msg=Consent+withdrawn+and+the+face+template+deleted`);
}
export default async function Enrol({ searchParams }: { searchParams: SP }) {
  await guard("attendance", "add");
  const sp = await searchParams; const sb = await supabase();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section");
  const classId = first(sp.class) ?? classes?.[0]?.id ?? "";
  const [{ data: studs }, { data: cons }, { data: tpl }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", classId).eq("status", "active").order("full_name"), sb.from("face_consents").select("student_id,given_by,given_on,withdrawn_on"), sb.from("face_templates").select("student_id")]);
  const cm = new Map((cons ?? []).map((c) => [c.student_id, c])); const has = new Set((tpl ?? []).map((t) => t.student_id));
  const mayConsent = await can("students", "add");
  return (
    <>
      <PageHeader title="Face consent & enrolment" sub="A child is recognised only after a guardian's consent is recorded and a clear photo is taken."><LinkBtn href={`/attendance/face?class=${classId}`} ghost>Back to scanning</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-4 flex items-end gap-2"><label className="text-sm">Class<select name="class" defaultValue={classId}>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></label><button className="rounded-lg border border-line px-3 py-2 text-sm">Open</button></form>
        <Table head={["Student", "Consent", "Face"]} empty={studs?.length ? undefined : "No students."}>
          {(studs ?? []).map((s) => { const c = cm.get(s.id); const on = c && !c.withdrawn_on; return (
            <tr key={s.id}><td className="font-medium">{s.full_name}</td>
              <td>{on ? <div className="text-sm"><Badge>consent: {c.given_by}</Badge> <span className="text-xs text-mute">{c.given_on}</span>{mayConsent && <form action={withdraw.bind(null, classId, s.id)} className="mt-1"><button className="text-xs text-red-600 underline">Withdraw and delete face</button></form>}</div>
                : mayConsent ? <form action={giveConsent.bind(null, classId)} className="flex gap-1"><input type="hidden" name="student_id" value={s.id} /><input name="given_by" placeholder="Who gave consent (e.g. Father)" required className="w-48" /><button className="rounded border border-line px-2 text-sm">Record</button></form> : <span className="text-xs text-mute">none{c?.withdrawn_on ? " (withdrawn)" : ""}</span>}</td>
              <td>{on ? <FaceEnrol studentId={s.id} name={s.full_name} enrolled={has.has(s.id)} enrol={enrol} /> : <span className="text-xs text-mute">needs consent first</span>}</td></tr>); })}
        </Table>
      </Card>
    </>
  );
}
