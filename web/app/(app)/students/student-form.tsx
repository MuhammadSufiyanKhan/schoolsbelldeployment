import { Field, Btn } from "@/components/ui";

type S = Partial<{ full_name: string; gender: string; dob: string; class_id: string; guardian_name: string; guardian_phone: string; guardian_email: string; address: string; status: string }>;
export default function StudentForm({ action, s = {}, classes, isNew }: { action: (fd: FormData) => Promise<void>; s?: S; classes: { id: string; name: string; section: string }[]; isNew?: boolean }) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Field label="Full name"><input name="full_name" defaultValue={s.full_name} required /></Field>
      <Field label="Class"><select name="class_id" defaultValue={s.class_id ?? ""} required><option value="" disabled>Select…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></Field>
      <Field label="Gender"><select name="gender" defaultValue={s.gender ?? "F"}><option value="F">Female</option><option value="M">Male</option></select></Field>
      <Field label="Date of birth"><input type="date" name="dob" defaultValue={s.dob ?? ""} required /></Field>
      <Field label="Guardian name"><input name="guardian_name" defaultValue={s.guardian_name ?? ""} required /></Field>
      <Field label="Guardian phone"><input name="guardian_phone" defaultValue={s.guardian_phone ?? ""} /></Field>
      <Field label="Guardian email (a parent who joins with this email is approved automatically)"><input type="email" name="guardian_email" defaultValue={s.guardian_email ?? ""} /></Field>
      <div className="md:col-span-2"><Field label="Address"><textarea name="address" rows={2} defaultValue={s.address ?? ""} /></Field></div>
      {!isNew && <Field label="Status"><select name="status" defaultValue={s.status}><option>active</option><option>inactive</option><option>graduated</option><option>archived</option></select></Field>}
      <div className="md:col-span-2"><Btn>{isNew ? "Add student" : "Save changes"}</Btn></div>
    </form>
  );
}
