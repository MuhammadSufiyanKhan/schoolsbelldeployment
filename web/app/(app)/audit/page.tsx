import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, PageHeader, Table, first, type SP } from "@/components/ui";

// Append-only record of who changed what. The database decides what each person may read: campus admins see their campus,
// head office sees every campus, nobody can edit or delete entries.
export default async function Audit({ searchParams }: { searchParams: SP }) {
  const p = await requireStaff();
  if (!["super_admin", "head_office", "campus_admin"].includes(p.role)) redirect("/?denied=1");
  const sp = await searchParams;
  const table = (first(sp.table) ?? "").replace(/[^a-z_]/g, "");
  const sb = await supabase();
  let q = sb.from("audit_log").select("id,at,action,table_name,row_id,actor").order("id", { ascending: false }).limit(200);
  if (table) q = q.eq("table_name", table);
  const { data } = await q;
  return (
    <>
      <PageHeader title="Audit log" sub="Last 200 changes. Entries cannot be edited or deleted." />
      <Card>
        <form className="mb-3 flex gap-2"><input name="table" defaultValue={table} placeholder="Filter by table, e.g. payments" className="max-w-xs" /><button className="rounded-lg border border-line px-4 text-sm">Filter</button></form>
        <Table head={["When (UTC)", "Action", "Table", "Record", "By"]} empty={data?.length ? undefined : "Nothing logged yet."}>
          {(data ?? []).map((r) => <tr key={r.id}><td className="whitespace-nowrap">{new Date(r.at).toISOString().replace("T", " ").slice(0, 19)}</td><td>{r.action}</td><td>{r.table_name}</td><td className="font-mono text-xs">{r.row_id?.slice(0, 8)}</td><td className="font-mono text-xs">{r.actor?.slice(0, 8) ?? "system"}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
