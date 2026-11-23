import { Field, Btn } from "@/components/ui";
type S = Partial<{ name: string; designation: string; department: string; phone: string; cnic: string; address: string; salary: number; join_date: string; status: string }>;
export default function StaffForm({ action, s = {}, isNew }: { action: (fd: FormData) => Promise<void>; s?: S; isNew?: boolean }) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Field label="Full name"><input name="name" defaultValue={s.name} required /></Field>
      <Field label="Designation"><input name="designation" defaultValue={s.designation} placeholder="Teacher, Accountant…" required /></Field>
      <Field label="Department"><input name="department" defaultValue={s.department} /></Field>
      <Field label="Phone"><input name="phone" defaultValue={s.phone} /></Field>
      <Field label="CNIC"><input name="cnic" defaultValue={s.cnic} placeholder="00000-0000000-0" /></Field>
      <Field label="Monthly salary (PKR)"><input type="number" min={0} name="salary" defaultValue={s.salary ?? 0} required /></Field>
      <Field label="Joining date"><input type="date" name="join_date" defaultValue={s.join_date} /></Field>
      {!isNew && <Field label="Status"><select name="status" defaultValue={s.status}><option>active</option><option>on leave</option><option>resigned</option></select></Field>}
      {isNew && <><Field label="Login email"><input type="email" name="email" required /></Field>
        <Field label="System role"><select name="role" defaultValue="teacher"><option value="teacher">Teacher</option><option value="hr">HR</option><option value="accountant">Accountant</option><option value="admin">Admin</option></select></Field></>}
      <div className="md:col-span-2"><Field label="Address"><textarea name="address" rows={2} defaultValue={s.address} /></Field></div>
      <div className="md:col-span-2"><Btn>{isNew ? "Add staff member" : "Save changes"}</Btn></div>
    </form>
  );
}
