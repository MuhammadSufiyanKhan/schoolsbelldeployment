import Link from "next/link";
import { guard } from "@/lib/auth";
import { all } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Table, Badge, LinkBtn, Flash, money, first, type SP } from "@/components/ui";

export default async function StaffList({ searchParams }: { searchParams: SP }) {
  const s = await guard("staff");
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim();
  const rows = all<{ id: number; emp_no: string; name: string; designation: string; department: string; phone: string; salary: number; status: string }>("SELECT * FROM staff WHERE name LIKE ? OR designation LIKE ? OR department LIKE ? ORDER BY name", `%${q}%`, `%${q}%`, `%${q}%`);
  return (
    <>
      <PageHeader title="Staff & HR" sub={`${rows.length} staff records`}>{can(s.role, "staff", true) && <LinkBtn href="/staff/new">+ Add staff</LinkBtn>}</PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, designation, department…" className="max-w-xs" /><button className="rounded-lg border border-line px-4 text-sm">Search</button></form>
        <Table head={["Emp #", "Name", "Designation", "Department", "Phone", "Salary", "Status"]} empty={rows.length ? undefined : "No staff found."}>
          {rows.map((r) => <tr key={r.id}><td>{r.emp_no}</td><td><Link href={`/staff/${r.id}`} className="font-medium text-brand hover:underline">{r.name}</Link></td><td>{r.designation}</td><td>{r.department}</td><td>{r.phone}</td><td>{money(r.salary)}</td><td><Badge tone={r.status === "active" ? "ok" : "mute"}>{r.status}</Badge></td></tr>)}
        </Table>
      </Card>
    </>
  );
}
