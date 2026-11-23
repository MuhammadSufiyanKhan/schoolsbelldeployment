import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Btn, Badge, Flash, str, first, type SP } from "@/components/ui";
import { STAGES, tone, findDuplicates } from "@/lib/admissions";

const DOCS = ["Birth certificate / B-form", "Previous school leaving certificate", "Passport-size photos", "Guardian CNIC copy"];

async function setStage(id: string, stage: string) {
  "use server";
  await guard("admissions", "edit");
  if (!(STAGES as readonly string[]).includes(stage) || stage === "enrolled") redirect(`/admissions/${id}`);
  const sb = await supabase();
  await sb.from("admissions").update({ stage }).eq("id", id);
  if (stage === "documents") {
    const { data: a } = await sb.from("admissions").select("school_id,campus_id").eq("id", id).maybeSingle();
    if (a) await sb.from("admission_documents").upsert(DOCS.map((kind) => ({ admission_id: id, school_id: a.school_id, campus_id: a.campus_id, kind })), { onConflict: "admission_id,kind", ignoreDuplicates: true });
  }
  redirect(`/admissions/${id}?msg=Moved+to+${stage}`);
}
async function saveDocs(id: string, fd: FormData) {
  "use server";
  await guard("admissions", "edit");
  const sb = await supabase();
  const { data: docs } = await sb.from("admission_documents").select("id").eq("admission_id", id);
  for (const d of docs ?? []) await sb.from("admission_documents").update({ received: fd.get("d_" + d.id) === "on" }).eq("id", d.id);
  redirect(`/admissions/${id}?msg=Documents+updated`);
}
async function saveInterview(id: string, fd: FormData) {
  "use server";
  await guard("admissions", "edit");
  const when = str(fd, "interview_at");
  await (await supabase()).from("admissions").update({ interview_at: when ? new Date(when).toISOString() : null, notes: str(fd, "notes") }).eq("id", id);
  redirect(`/admissions/${id}?msg=Saved`);
}
async function enroll(id: string) {
  "use server";
  const p = await guard("admissions", "edit");
  const sb = await supabase();
  const { data: a } = await sb.from("admissions").select("*").eq("id", id).maybeSingle();
  if (!a || a.stage !== "accepted") redirect(`/admissions/${id}?msg=Accept+the+application+first`);
  if (!a!.class_id) redirect(`/admissions/${id}?msg=Choose+a+class+before+enrolling`);
  const dups = (await sb.from("students").select("full_name,admission_no").ilike("full_name", a!.applicant_name.replace(/[%_,()]/g, " ")).eq("dob", a!.dob ?? "1900-01-01")).data ?? [];
  if (dups.length) redirect(`/admissions/${id}?msg=${encodeURIComponent("A student with this name and date of birth already exists: " + dups[0].admission_no)}`);
  const { count } = await sb.from("students").select("*", { count: "exact", head: true });
  let no = `A-${String((count ?? 0) + 1).padStart(3, "0")}`;
  const row = { school_id: p.school_id, campus_id: a!.campus_id, class_id: a!.class_id, full_name: a!.applicant_name, dob: a!.dob, guardian_name: a!.guardian_name, guardian_phone: a!.guardian_phone, guardian_email: a!.guardian_email };
  let ins = await sb.from("students").insert({ ...row, admission_no: no, roll_no: no }).select("id").single();
  if (ins.error?.code === "23505") { no += "-" + Math.random().toString(36).slice(2, 5); ins = await sb.from("students").insert({ ...row, admission_no: no, roll_no: no }).select("id").single(); }
  if (ins.error || !ins.data) redirect(`/admissions/${id}?msg=${encodeURIComponent(ins.error?.message ?? "Could not enrol")}`);
  await sb.from("admissions").update({ stage: "enrolled", student_id: ins.data!.id }).eq("id", id);
  redirect(`/students/${ins.data!.id}?msg=${encodeURIComponent("Enrolled as " + no)}`);
}

export default async function AdmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("admissions");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: a } = await sb.from("admissions").select("*,classes(name,section)").eq("id", id).maybeSingle();
  if (!a) notFound();
  const { data: docs } = await sb.from("admission_documents").select("id,kind,received").eq("admission_id", id).order("kind");
  const dups = a.stage === "enrolled" ? [] : await findDuplicates(a.applicant_name, a.dob, id);
  const w = await can("admissions", "edit");
  const cls = a.classes as unknown as { name: string; section: string } | null;
  const missing = (docs ?? []).filter((d) => !d.received).length;
  const local = a.interview_at ? new Date(a.interview_at).toISOString().slice(0, 16) : "";
  return (
    <>
      <PageHeader title={a.applicant_name} sub={`${cls ? cls.name + "-" + cls.section : "No class chosen"} · guardian ${a.guardian_name}${a.guardian_phone ? " · " + a.guardian_phone : ""}`}><Badge tone={tone(a.stage)}>{a.stage}</Badge></PageHeader>
      <Flash msg={first(sp.msg)} />
      {dups.length > 0 && <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><b>Possible duplicate:</b> {dups.join("; ")}</div>}
      {w && a.stage !== "enrolled" && <Card className="mb-4"><h2 className="mb-2 font-semibold">Move to stage</h2><div className="flex flex-wrap gap-2">
        {STAGES.filter((s) => s !== "enrolled" && s !== a.stage).map((s) => <form key={s} action={setStage.bind(null, id, s)}><Btn variant="ghost" className="capitalize">{s}</Btn></form>)}
        {a.stage === "accepted" && <form action={enroll.bind(null, id)}><Btn>Enrol as student</Btn></form>}</div></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Documents {docs?.length ? <span className="text-sm font-normal text-mute">({missing} missing)</span> : null}</h2>
          {docs?.length ? <form action={saveDocs.bind(null, id)} className="space-y-2">{docs.map((d) => <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`d_${d.id}`} defaultChecked={d.received} disabled={!w} />{d.kind}</label>)}{w && <Btn variant="ghost">Save</Btn>}</form> : <p className="text-sm text-mute">The checklist appears when the application moves to “documents”.</p>}</Card>
        <Card><h2 className="mb-2 font-semibold">Interview & notes</h2>
          <form action={saveInterview.bind(null, id)} className="space-y-2"><input type="datetime-local" name="interview_at" defaultValue={local} disabled={!w} /><textarea name="notes" rows={4} defaultValue={a.notes ?? ""} disabled={!w} />{w && <Btn variant="ghost">Save</Btn>}</form></Card>
      </div>
    </>
  );
}
