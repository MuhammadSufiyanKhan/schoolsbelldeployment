import Link from "next/link";
import { redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Table, Btn, Field, Flash, str, num, first, today, type SP } from "@/components/ui";

async function create(fd: FormData) {
  "use server";
  await guard("exams", true);
  run("INSERT INTO exams(name,class_id,date,total) VALUES(?,?,?,?)", str(fd, "name"), num(fd, "class_id"), str(fd, "date"), num(fd, "total") || 100);
  redirect("/exams?msg=Exam+created");
}
export default async function Exams({ searchParams }: { searchParams: SP }) {
  const s = await guard("exams");
  const sp = await searchParams;
  const exams = all<{ id: number; name: string; date: string; total: number; cname: string; section: string }>("SELECT e.*, c.name cname, c.section FROM exams e JOIN classes c ON c.id=e.class_id ORDER BY date DESC");
  const classes = all<{ id: number; name: string; section: string }>("SELECT id,name,section FROM classes ORDER BY name,section");
  return (
    <>
      <PageHeader title="Exams & results" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><Table head={["Exam", "Class", "Date", "Total marks"]} empty={exams.length ? undefined : "No exams yet."}>
          {exams.map((e) => <tr key={e.id}><td><Link className="font-medium text-brand hover:underline" href={`/exams/${e.id}`}>{e.name}</Link></td><td>{e.cname}-{e.section}</td><td>{e.date}</td><td>{e.total}</td></tr>)}</Table></Card>
        {can(s.role, "exams", true) && <Card><h2 className="mb-3 font-semibold">New exam</h2><form action={create} className="space-y-3">
          <Field label="Name"><input name="name" placeholder="Mid-term" required /></Field>
          <Field label="Class"><select name="class_id">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></Field>
          <Field label="Date"><input type="date" name="date" defaultValue={today()} /></Field>
          <Field label="Total marks per subject"><input type="number" name="total" defaultValue={100} min={1} /></Field><Btn>Create</Btn></form></Card>}
      </div>
    </>
  );
}
