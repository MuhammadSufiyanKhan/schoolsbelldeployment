import { redirect } from "next/navigation";
import { guard, can, activeCampus, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Btn, Field, Flash, money, str, first, type SP } from "@/components/ui";

async function addClass(fd: FormData) {
  "use server";
  const p = await guard("classes", "add");
  const campus = await activeCampus();
  if (!campus) redirect("/classes?msg=No+campus+available");
  const { error } = await (await supabase()).from("classes").insert({ school_id: p.school_id, campus_id: campus.id, name: str(fd, "name"), section: str(fd, "section"), monthly_fee: Number(fd.get("fee") || 0) });
  redirect(`/classes?msg=${error ? encodeURIComponent(error.message) : "Class+added"}`);
}
async function addSubject(fd: FormData) {
  "use server";
  const p = await guard("classes", "add");
  const sb = await supabase();
  const { data: c } = await sb.from("classes").select("campus_id").eq("id", str(fd, "class_id")).maybeSingle();
  if (c) await sb.from("subjects").insert({ school_id: p.school_id, campus_id: c.campus_id, class_id: str(fd, "class_id"), name: str(fd, "name") });
  redirect("/classes?msg=Subject+added");
}

export default async function Classes({ searchParams }: { searchParams: SP }) {
  await guard("classes");
  const sp = await searchParams;
  const sb = await supabase();
  const campus = await scopeCampusId();
  let q = sb.from("classes").select("id,name,section,monthly_fee,subjects(id,name),students(count)").order("name").order("section");
  if (campus) q = q.eq("campus_id", campus);
  const { data } = await q;
  const classes = (data ?? []) as unknown as { id: string; name: string; section: string; monthly_fee: number; subjects: { id: string; name: string }[]; students: { count: number }[] }[];
  const w = await can("classes", "add");
  return (
    <>
      <PageHeader title="Classes & subjects" />
      <Flash msg={first(sp.msg)} />
      <div className="grid gap-4 md:grid-cols-2">
        {classes.map((c) => (
          <Card key={c.id}><div className="flex items-baseline justify-between"><h2 className="font-semibold">{c.name}-{c.section}</h2><span className="text-sm text-mute">{c.students[0]?.count ?? 0} students · {money(c.monthly_fee)}/mo</span></div>
            <Table head={["Subject"]}>{c.subjects.map((x) => <tr key={x.id}><td>{x.name}</td></tr>)}</Table>
            {w && <form action={addSubject} className="mt-3 flex gap-2"><input type="hidden" name="class_id" value={c.id} /><input name="name" placeholder="New subject" required /><Btn variant="ghost">Add</Btn></form>}</Card>))}
      </div>
      {w && <Card className="mt-4 max-w-xl"><h2 className="mb-3 font-semibold">Add class</h2>
        <form action={addClass} className="grid grid-cols-2 gap-3"><Field label="Name"><input name="name" placeholder="Class 9" required /></Field><Field label="Section"><input name="section" placeholder="A" /></Field>
          <Field label="Monthly fee (PKR)"><input type="number" name="fee" min={0} defaultValue={0} /></Field><div className="col-span-2"><Btn>Add class</Btn></div></form></Card>}
    </>
  );
}
