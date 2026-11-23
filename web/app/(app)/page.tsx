import { requireStaff, can, scopeCampusId } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { Card, Grid, PageHeader, Stat, Flash, money, today, first, type SP, LinkBtn } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const p = await requireStaff();
  const sp = await searchParams;
  const sb = await supabase();
  const campus = await scopeCampusId();
  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) => (campus ? q.eq("campus_id", campus) : q);
  const count = async (table: string, extra?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(table).select("*", { count: "exact", head: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
    q = scoped(q); if (extra) q = extra(q);
    return (await q).count ?? 0;
  };
  // All of these are independent, so they run together: one round trip to the database instead of five.
  const [canStu, canAtt, canFees, canAddStu] = await Promise.all([can("students"), can("attendance"), can("fees"), can("students", "add")]);
  type Challan = { amount: number; discount: number; payments: { amount: number; voided_at: string | null }[] };
  const [students, present, total, challans, noticesRes] = await Promise.all([
    canStu ? count("students", (q) => q.eq("status", "active")) : null,
    canAtt ? count("attendance", (q) => q.eq("date", today()).eq("status", "P")) : null,
    canAtt ? count("attendance", (q) => q.eq("date", today())) : null,
    canFees ? (scoped(sb.from("challans").select("amount,discount,payments(amount,voided_at)") as any) as unknown as PromiseLike<{ data: Challan[] | null }>) : null, // eslint-disable-line @typescript-eslint/no-explicit-any
    sb.from("notices").select("id,title,body,created_at").order("created_at", { ascending: false }).limit(3),
  ]);
  const stats: [string, React.ReactNode][] = [];
  if (students !== null) stats.push(["Active students", students]);
  if (present !== null && total !== null) stats.push(["Students present today", total ? `${Math.round((present / total) * 100)}%` : "—"]);
  if (challans) {
    const rows = challans.data ?? [];
    const billed = rows.reduce((a, r) => a + Number(r.amount) - Number(r.discount), 0);
    const paid = rows.reduce((a, r) => a + r.payments.filter((x) => !x.voided_at).reduce((s, x) => s + Number(x.amount), 0), 0);
    stats.push(["Collected", money(paid)], ["Outstanding fees", money(billed - paid)]);
  }
  const notices = noticesRes.data;
  return (
    <>
      <PageHeader title={`Hello, ${p.full_name.split(" ")[0]}`} sub={new Date().toDateString()} />
      <Flash err={first(sp.denied) ? "You don't have access to that page." : undefined} />
      <Grid>{stats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}</Grid>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Notices</h2>
          {notices?.length ? notices.map((a) => <div key={a.id} className="border-b border-line py-2 last:border-0"><div className="font-medium">{a.title}</div><div className="text-sm text-mute">{a.body}</div></div>) : <p className="text-sm text-mute">Nothing yet.</p>}</Card>
        <Card><h2 className="mb-2 font-semibold">Quick actions</h2><div className="flex flex-wrap gap-2">
          {canAddStu && <LinkBtn href="/students/new">Add student</LinkBtn>}
          {canAtt && <LinkBtn href="/attendance" ghost>Mark attendance</LinkBtn>}
          {canFees && <LinkBtn href="/fees" ghost>Fees</LinkBtn>}
          <LinkBtn href="/notices" ghost>Notices</LinkBtn></div></Card>
      </div>
    </>
  );
}
