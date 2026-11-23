import Link from "next/link";
import { redirect } from "next/navigation";
import { guard, can, activeCampus, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, Btn, Field, Flash, str, first, type SP } from "@/components/ui";
import AdmissionPhoto from "@/components/admission-photo";
import { STAGES, tone, findDuplicates } from "@/lib/admissions";

async function add(fd: FormData) {
  "use server";
  const p = await guard("admissions", "add");
  const campus = await activeCampus();
  if (!campus) redirect("/admissions?msg=No+campus+available");
  const name = str(fd, "applicant_name"), dob = str(fd, "dob") || null;
  const dups = await findDuplicates(name, dob);
  if (dups.length && fd.get("force") !== "on") redirect("/admissions?msg=" + encodeURIComponent(`Possible duplicate: ${dups.join("; ")}. Tick "Save anyway" if this is a different child.`));
  const { error } = await (await supabase()).from("admissions").insert({
    school_id: p.school_id, campus_id: campus!.id, applicant_name: name, dob, guardian_name: str(fd, "guardian_name"), guardian_phone: str(fd, "guardian_phone"),
    guardian_email: str(fd, "guardian_email").toLowerCase() || null, class_id: str(fd, "class_id") || null, notes: str(fd, "notes"),
  });
  redirect(`/admissions?msg=${error ? encodeURIComponent(error.message) : "Enquiry+recorded"}`);
}

export default async function Admissions({ searchParams }: { searchParams: SP }) {
  await guard("admissions");
  const sp = await searchParams;
  const stage = first(sp.stage) ?? "";
  const sb = await supabase();
  const campus = await scopeCampusId();
  let q = sb.from("admissions").select("id,applicant_name,guardian_name,guardian_phone,stage,created_at,classes(name,section)").order("created_at", { ascending: false });
  if (campus) q = q.eq("campus_id", campus);
  if (stage) q = q.eq("stage", stage);
  const [{ data: rows }, { data: classes }] = await Promise.all([q, sb.from("classes").select("id,name,section").order("name").order("section")]);
  const list = (rows ?? []) as unknown as { id: string; applicant_name: string; guardian_name: string; guardian_phone: string; stage: string; created_at: string; classes: { name: string; section: string } | null }[];
  return (
    <>
      <PageHeader title="Admissions" sub="Enquiry → documents → interview → accepted → enrolled" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2 text-sm"><Link href="/admissions" className={`rounded-full border border-line px-3 py-1 ${stage ? "" : "bg-brand text-white dark:text-black"}`}>All</Link>{STAGES.map((s) => <Link key={s} href={`/admissions?stage=${s}`} className={`rounded-full border border-line px-3 py-1 capitalize ${stage === s ? "bg-brand text-white dark:text-black" : ""}`}>{s}</Link>)}</div>
          <Table head={["Applicant", "Class", "Guardian", "Stage"]} empty={list.length ? undefined : "No applications."}>
            {list.map((r) => <tr key={r.id}><td><Link className="font-medium text-brand hover:underline" href={`/admissions/${r.id}`}>{r.applicant_name}</Link><div className="text-xs text-mute">{r.created_at.slice(0, 10)}</div></td><td>{r.classes ? `${r.classes.name}-${r.classes.section}` : "—"}</td><td>{r.guardian_name}<div className="text-xs text-mute">{r.guardian_phone}</div></td><td><Badge tone={tone(r.stage)}>{r.stage}</Badge></td></tr>)}</Table>
        </Card>
        {(await can("admissions", "add")) && <Card><h2 className="mb-3 font-semibold">New enquiry</h2><form action={add} className="space-y-3"><AdmissionPhoto />
          <Field label="Applicant's name"><input name="applicant_name" required /></Field><Field label="Date of birth"><input type="date" name="dob" required /></Field>
          <Field label="Guardian"><input name="guardian_name" required /></Field><Field label="Guardian phone"><input name="guardian_phone" /></Field><Field label="Guardian email"><input type="email" name="guardian_email" /></Field>
          <Field label="Applying for"><select name="class_id"><option value="">—</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></Field>
          <Field label="Notes"><textarea name="notes" rows={2} /></Field>
          <label className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" name="force" /> Save anyway if a duplicate is found</label><Btn>Save enquiry</Btn></form></Card>}
      </div>
    </>
  );
}
