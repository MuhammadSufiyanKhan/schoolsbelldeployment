import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run, audit } from "@/lib/db";
import { nextNo, q } from "@/lib/util";
import { can } from "@/lib/perm";
import { Card, PageHeader, Table, Badge, Btn, Field, Flash, str, num, first, type SP } from "@/components/ui";

async function add(fd: FormData) {
  "use server";
  await guard("admissions", true);
  run("INSERT INTO admissions(applicant,guardian,phone,class_id,notes) VALUES(?,?,?,?,?)", str(fd, "applicant"), str(fd, "guardian"), str(fd, "phone"), num(fd, "class_id"), str(fd, "notes"));
  redirect("/admissions?msg=Enquiry+recorded");
}
async function setStatus(fd: FormData) {
  "use server";
  const s = await guard("admissions", true);
  const id = num(fd, "id"), status = str(fd, "status");
  if (!["new", "contacted", "accepted", "rejected"].includes(status)) redirect("/admissions");
  run("UPDATE admissions SET status=? WHERE id=?", status, id);
  audit(s.name, `admission #${id} → ${status}`);
  redirect("/admissions");
}
async function enroll(fd: FormData) {
  "use server";
  const s = await guard("admissions", true);
  const a = one<{ applicant: string; guardian: string; phone: string; class_id: number; status: string }>("SELECT * FROM admissions WHERE id=?", num(fd, "id"));
  if (!a || a.status !== "accepted") redirect("/admissions?msg=Accept+the+application+first");
  const no = nextNo("students", "admission_no", "A-");
  run("INSERT INTO students(admission_no,name,class_id,guardian_name,guardian_phone) VALUES(?,?,?,?,?)", no, a.applicant, a.class_id, a.guardian, a.phone);
  run("UPDATE admissions SET status='enrolled' WHERE id=?", num(fd, "id"));
  audit(s.name, `enrolled ${a.applicant} as ${no}`);
  redirect(`/admissions?msg=${q("Enrolled as " + no)}`);
}

export default async function Admissions({ searchParams }: { searchParams: SP }) {
  const s = await guard("admissions");
  const sp = await searchParams;
  const w = can(s.role, "admissions", true);
  const rows = all<{ id: number; applicant: string; guardian: string; phone: string; status: string; cname: string; section: string; created_at: string }>("SELECT a.*, c.name cname, c.section FROM admissions a LEFT JOIN classes c ON c.id=a.class_id ORDER BY a.id DESC");
  const classes = all<{ id: number; name: string; section: string }>("SELECT id,name,section FROM classes ORDER BY name,section");
  return (
    <>
      <PageHeader title="Admissions" sub="Enquiries → accepted → enrolled as a student" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><Table head={["Applicant", "Class", "Guardian", "Status", ""]} empty={rows.length ? undefined : "No enquiries."}>
          {rows.map((r) => <tr key={r.id}><td className="font-medium">{r.applicant}<div className="text-xs text-mute">{r.created_at.slice(0, 10)}</div></td><td>{r.cname}-{r.section}</td><td>{r.guardian}<div className="text-xs text-mute">{r.phone}</div></td>
            <td><Badge tone={r.status === "enrolled" || r.status === "accepted" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status}</Badge></td>
            <td>{w && r.status !== "enrolled" && <div className="flex flex-wrap gap-1">
              <form action={setStatus} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><select name="status" defaultValue={r.status} className="!w-28 !py-1 text-xs"><option>new</option><option>contacted</option><option>accepted</option><option>rejected</option></select><Btn variant="ghost" className="!px-2 !py-1 text-xs">Set</Btn></form>
              {r.status === "accepted" && <form action={enroll}><input type="hidden" name="id" value={r.id} /><Btn className="!px-2 !py-1 text-xs">Enroll</Btn></form>}</div>}</td></tr>)}</Table></Card>
        {w && <Card><h2 className="mb-3 font-semibold">New enquiry</h2><form action={add} className="space-y-3"><Field label="Applicant"><input name="applicant" required /></Field><Field label="Guardian"><input name="guardian" required /></Field><Field label="Phone"><input name="phone" /></Field>
          <Field label="Applying for"><select name="class_id">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></Field><Field label="Notes"><textarea name="notes" rows={2} /></Field><Btn>Save</Btn></form></Card>}
      </div>
    </>
  );
}
