import Link from "next/link";
import { guard, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, Badge, LinkBtn, Flash, money, first, type SP } from "@/components/ui";

export default async function StaffList({ searchParams }: { searchParams: SP }) {
  await guard("staff");
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().replace(/[,()%*]/g, " ");
  const sb = await supabase();
  const campus = await scopeCampusId();
  let query = sb.from("staff").select("id,emp_no,full_name,designation,department,phone,salary,status").order("full_name");
  if (campus) query = query.eq("campus_id", campus);
  if (q) query = query.or(`full_name.ilike.%${q}%,designation.ilike.%${q}%,department.ilike.%${q}%`);
  const { data } = await query;
  const showSalary = await can("payroll");
  return (
    <>
      <PageHeader title="Staff" sub={`${data?.length ?? 0} records`}>{(await can("staff", "add")) && <LinkBtn href="/staff/new">+ Add staff</LinkBtn>}</PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, designation, department…" className="max-w-xs" /><button className="rounded-lg border border-line px-4 text-sm">Search</button></form>
        <Table head={["Emp #", "Name", "Designation", "Department", "Phone", ...(showSalary ? ["Salary"] : []), "Status"]} empty={data?.length ? undefined : "No staff found."}>
          {(data ?? []).map((r) => <tr key={r.id}><td>{r.emp_no}</td><td><Link href={`/staff/${r.id}`} className="font-medium text-brand hover:underline">{r.full_name}</Link></td><td>{r.designation}</td><td>{r.department}</td><td>{r.phone}</td>{showSalary && <td>{money(r.salary)}</td>}<td><Badge tone={r.status === "active" ? "ok" : "mute"}>{r.status}</Badge></td></tr>)}
        </Table>
      </Card>
    </>
  );
}
