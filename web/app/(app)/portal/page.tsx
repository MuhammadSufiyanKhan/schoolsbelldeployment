import Link from "next/link";
import { requireFamily } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { grade } from "@/lib/grade";
import { Card, PageHeader, Table, Badge, Stat, Grid, money } from "@/components/ui";

// Every query below runs as the parent. Row level security returns only their confirmed children
// and only published exams, so there is no per-child permission check to forget here.
export default async function Portal() {
  await requireFamily();
  const sb = await supabase();
  const { data: kids } = await sb.from("students").select("id,full_name,admission_no,classes(name,section)").order("full_name");
  const { data: pending } = await sb.from("student_guardians").select("student_id,status").eq("status", "pending");
  if (!kids?.length) return (<><PageHeader title="My children" /><Card><p className="text-sm text-mute">{pending?.length ? "Your request has been sent. The school will confirm the link soon." : "No child is linked to this account yet. Please contact the school office."}</p></Card></>);
  const blocks = await Promise.all(kids.map(async (k) => {
    const [att, ch, mk, rm, tt] = await Promise.all([
      sb.from("attendance").select("status").eq("student_id", k.id),
      sb.from("challans").select("month,amount,discount,payments(amount,voided_at)").eq("student_id", k.id).order("month", { ascending: false }),
      sb.from("marks").select("obtained,exams(id,name,exam_date,total)").eq("student_id", k.id),
      sb.from("report_remarks").select("exam_id,remark_en,remark_ur").eq("student_id", k.id),
      sb.from("timetable").select("day,period,subjects(name),rooms(name)").order("period"),
    ]);
    const present = (att.data ?? []).filter((a) => a.status === "P").length;
    const fees = (ch.data ?? []).map((c) => { const bill = Number(c.amount) - Number(c.discount); const paid = (c.payments as { amount: number; voided_at: string | null }[]).filter((x) => !x.voided_at).reduce((a, x) => a + Number(x.amount), 0); return { month: c.month, bill, paid }; });
    const byExam = new Map<string, { id: string; name: string; date: string; got: number; max: number }>();
    for (const m of (mk.data ?? []) as unknown as { obtained: number; exams: { id: string; name: string; exam_date: string; total: number } }[]) {
      const e = byExam.get(m.exams.id) ?? { id: m.exams.id, name: m.exams.name, date: m.exams.exam_date, got: 0, max: 0 };
      e.got += Number(m.obtained); e.max += Number(m.exams.total); byExam.set(m.exams.id, e);
    }
    const dow = (new Date().getDay() + 6) % 7;  // Monday = 0
    return { k, pct: att.data?.length ? Math.round((present / att.data.length) * 100) : null, fees, exams: [...byExam.values()], remarks: rm.data ?? [], today: ((tt.data ?? []) as unknown as { day: number; period: number; subjects: { name: string }; rooms: { name: string } | null }[]).filter((x) => x.day === dow) };
  }));
  return (
    <>
      <PageHeader title="My children" sub="Attendance, results and fees" />
      <div className="space-y-6">{blocks.map(({ k, pct, fees, exams, remarks, today }) => {
        const cls = k.classes as unknown as { name: string; section: string } | null;
        const due = fees.reduce((a, f) => a + f.bill - f.paid, 0);
        return (
          <Card key={k.id}><div className="mb-3"><h2 className="text-lg font-bold">{k.full_name}</h2><p className="text-sm text-mute">{cls ? `${cls.name}-${cls.section}` : ""} · {k.admission_no}</p></div>
            <Grid cols={3}><Stat label="Attendance" value={pct === null ? "—" : pct + "%"} /><Stat label="Fees due" value={money(due)} /><Stat label="Published exams" value={exams.length} /></Grid>
            {today.length > 0 && <><h3 className="mt-4 mb-1 font-semibold">Today's timetable</h3><div className="flex flex-wrap gap-2">{today.map((t) => <Badge key={t.period} tone="mute">{t.period}. {t.subjects.name}{t.rooms ? ` · ${t.rooms.name}` : ""}</Badge>)}</div></>}
            <h3 className="mt-4 mb-1 font-semibold">Results</h3>
            <Table head={["Exam", "Date", "Marks", "%", "Grade", ""]} empty={exams.length ? undefined : "No published results yet."}>{exams.map((e) => { const p = (e.got / e.max) * 100; return <tr key={e.name + e.date}><td>{e.name}</td><td>{e.date}</td><td>{e.got}/{e.max}</td><td>{p.toFixed(1)}</td><td><Badge tone={p < 40 ? "bad" : "ok"}>{grade(p)}</Badge></td><td><Link className="text-brand underline" href={`/exams/${e.id}/report?student=${k.id}`}>Report card</Link></td></tr>; })}</Table>
            {exams.map((e) => { const r = remarks.find((x) => x.exam_id === e.id); return r && (r.remark_en || r.remark_ur) ? <div key={e.id} className="mt-2 rounded border border-line p-3 text-sm"><div className="mb-1 text-xs text-mute">{e.name}</div><p>{r.remark_en}</p><p dir="rtl" lang="ur" className="text-base leading-loose">{r.remark_ur}</p></div> : null; })}
            <h3 className="mt-4 mb-1 font-semibold">Fees</h3>
            <Table head={["Month", "Billed", "Status"]} empty={fees.length ? undefined : "No challans."}>{fees.map((f) => <tr key={f.month}><td>{f.month}</td><td>{money(f.bill)}</td><td><Badge tone={f.paid >= f.bill ? "ok" : "bad"}>{f.paid >= f.bill ? "Paid" : money(f.bill - f.paid) + " due"}</Badge></td></tr>)}</Table>
          </Card>);
      })}</div>
      <p className="mt-4 text-sm"><Link href="/notices" className="text-brand underline">School notices →</Link></p>
    </>
  );
}
