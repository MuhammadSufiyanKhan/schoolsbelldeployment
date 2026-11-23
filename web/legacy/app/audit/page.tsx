import { guard } from "@/lib/auth";
import { all } from "@/lib/db";
import { Card, PageHeader, Table } from "@/components/ui";

export default async function Audit() {
  await guard("audit");
  const rows = all<{ id: number; who: string; action: string; at: string }>("SELECT * FROM audit ORDER BY id DESC LIMIT 200");
  return (<><PageHeader title="Audit log" sub="Last 200 actions" /><Card><Table head={["When (UTC)", "Who", "Action"]} empty={rows.length ? undefined : "Nothing logged yet."}>{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{r.at}</td><td>{r.who}</td><td>{r.action}</td></tr>)}</Table></Card></>);
}
