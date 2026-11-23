import Link from "next/link";
import { guard, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, LinkBtn, Flash, first, type SP } from "@/components/ui";

export default async function Students({ searchParams }: { searchParams: SP }) {
  await guard("students");
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().replace(/[,()%*]/g, " ");
  const cls = first(sp.cls) ?? "";
  const sb = await supabase();
  const campus = await scopeCampusId();
  const { data: classes } = await sb.from("classes").select("id,name,section").order("name").order("section");
  let query = sb.from("students").select("id,admission_no,full_name,guardian_name,guardian_phone,status,class_id,classes(name,section)").order("full_name").limit(500);
  if (campus) query = query.eq("campus_id", campus);
  if (cls) query = query.eq("class_id", cls);
  if (q) query = query.or(`full_name.ilike.%${q}%,admission_no.ilike.%${q}%,guardian_name.ilike.%${q}%`);
  const { data: rows } = await query;
  const list = (rows ?? []) as unknown as { id: string; admission_no: string; full_name: string; guardian_name: string; guardian_phone: string; status: string; classes: { name: string; section: string } | null }[];
  return (
    <>
      <PageHeader title="Students" sub={`${list.length} shown`}>{(await can("students", "add")) && <LinkBtn href="/students/new">+ Add student</LinkBtn>}</PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-3 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Search name, admission no, guardian…" className="max-w-xs" />
          <select name="cls" defaultValue={cls} className="max-w-[10rem]"><option value="">All classes</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select>
          <button className="rounded-lg border border-line px-4 text-sm">Filter</button></form>
        <Table head={["Adm #", "Name", "Class", "Guardian", "Phone", "Status"]} empty={list.length ? undefined : "No students found."}>
          {list.map((r) => <tr key={r.id}><td>{r.admission_no}</td><td><Link href={`/students/${r.id}`} className="font-medium text-brand hover:underline">{r.full_name}</Link></td><td>{r.classes ? `${r.classes.name}-${r.classes.section}` : "—"}</td><td>{r.guardian_name}</td><td>{r.guardian_phone}</td><td><Badge tone={r.status === "active" ? "ok" : "mute"}>{r.status}</Badge></td></tr>)}
        </Table>
      </Card>
    </>
  );
}
