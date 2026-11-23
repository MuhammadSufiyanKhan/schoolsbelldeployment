import Link from "next/link";
import { redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Btn, Field, Badge, Flash, str, first, today, type SP } from "@/components/ui";

async function create(fd: FormData) {
  "use server";
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: c } = await sb.from("classes").select("campus_id").eq("id", str(fd, "class_id")).maybeSingle();
  if (!c) redirect("/exams?msg=Class+not+found");
  const { error } = await sb.from("exams").insert({ school_id: p.school_id, campus_id: c.campus_id, class_id: str(fd, "class_id"), name: str(fd, "name"), exam_date: str(fd, "date") || null, total: Number(fd.get("total") || 100) });
  redirect(`/exams?msg=${error ? encodeURIComponent(error.message) : "Exam+created"}`);
}

export default async function Exams({ searchParams }: { searchParams: SP }) {
  await guard("exams");
  const sp = await searchParams;
  const sb = await supabase();
  const [{ data: exams }, { data: classes }] = await Promise.all([
    sb.from("exams").select("id,name,exam_date,total,published,classes(name,section)").order("exam_date", { ascending: false }),
    sb.from("classes").select("id,name,section").order("name").order("section"),
  ]);
  const rows = (exams ?? []) as unknown as { id: string; name: string; exam_date: string; total: number; published: boolean; classes: { name: string; section: string } }[];
  return (
    <>
      <PageHeader title="Exams & report cards" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card><Table head={["Exam", "Class", "Date", "Out of", "Results"]} empty={rows.length ? undefined : "No exams yet."}>
          {rows.map((e) => <tr key={e.id}><td><Link className="font-medium text-brand hover:underline" href={`/exams/${e.id}`}>{e.name}</Link></td><td>{e.classes.name}-{e.classes.section}</td><td>{e.exam_date}</td><td>{e.total}</td><td><Badge tone={e.published ? "ok" : "warn"}>{e.published ? "Published" : "Draft"}</Badge></td></tr>)}</Table></Card>
        {(await can("exams", "add")) && <Card><h2 className="mb-3 font-semibold">New exam</h2><form action={create} className="space-y-3">
          <Field label="Name"><input name="name" placeholder="Mid-term" required /></Field>
          <Field label="Class"><select name="class_id" required>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></Field>
          <Field label="Date"><input type="date" name="date" defaultValue={today()} /></Field>
          <Field label="Total marks per subject"><input type="number" name="total" defaultValue={100} min={1} /></Field><Btn>Create</Btn></form></Card>}
      </div>
    </>
  );
}
