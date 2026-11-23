import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { grade } from "@/lib/grade";
import PrintButton from "@/components/print-button";
import { first, type SP } from "@/components/ui";

// A4 report cards. Everything is read as the signed-in person, so a parent only ever gets their own child's card
// and only for a published exam; staff get the classes their role allows.
export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireProfile();
  const { id } = await params;
  const only = first((await searchParams).student);
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,exam_date,total,class_id,classes(name,section),campuses(name)").eq("id", id).maybeSingle();
  if (!ex) notFound();
  const { data: school } = await sb.from("schools").select("name").maybeSingle();
  let sq = sb.from("students").select("id,full_name,admission_no,guardian_name").eq("class_id", ex.class_id).eq("status", "active").order("full_name");
  if (only) sq = sq.eq("id", only);
  const [{ data: studs }, { data: subs }, { data: mk }, { data: rem }, { data: att }] = await Promise.all([
    sq, sb.from("subjects").select("id,name").eq("class_id", ex.class_id).order("name"),
    sb.from("marks").select("student_id,subject_id,obtained").eq("exam_id", id),
    sb.from("report_remarks").select("student_id,remark_en,remark_ur").eq("exam_id", id),
    sb.from("attendance").select("student_id,status").eq("class_id", ex.class_id),
  ]);
  if (!studs?.length) notFound();
  const total = Number(ex.total);
  const marks = new Map((mk ?? []).map((m) => [`${m.student_id}_${m.subject_id}`, Number(m.obtained)]));
  // class position is computed over everyone in the class that this person is allowed to see marks for
  const totals = new Map<string, number>();
  for (const m of mk ?? []) totals.set(m.student_id, (totals.get(m.student_id) ?? 0) + Number(m.obtained));
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const position = (sid: string) => { const t = totals.get(sid); return t === undefined ? null : ordered.findIndex(([, v]) => v === t) + 1; };
  const cls = ex.classes as unknown as { name: string; section: string };
  const campus = ex.campuses as unknown as { name: string };
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 print:hidden"><PrintButton label="Print report card(s)" /><span className="text-sm text-mute">{studs.length} card{studs.length > 1 ? "s" : ""}, one per A4 page.</span></div>
      {studs.map((s) => {
        const got = (subs ?? []).map((u) => marks.get(`${s.id}_${u.id}`));
        const sum = got.reduce<number>((a, b) => a + (b ?? 0), 0), max = got.filter((x) => x !== undefined).length * total;
        const pct = max ? (sum / max) * 100 : null;
        const a = (att ?? []).filter((x) => x.student_id === s.id);
        const apct = a.length ? Math.round((a.filter((x) => x.status === "P").length / a.length) * 100) : null;
        const r = rem?.find((x) => x.student_id === s.id);
        return (
          <section key={s.id} className="mx-auto mb-6 w-full max-w-[210mm] rounded-xl border border-line bg-card p-8 print:mb-0 print:max-w-none print:break-after-page print:rounded-none print:border-0 print:p-0">
            <header className="border-b-2 border-brand pb-3 text-center"><h1 className="text-xl font-bold">{school?.name}</h1><p className="text-sm text-mute">{campus?.name} · Report card · {ex.name}</p></header>
            <dl className="my-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm"><dt className="text-mute">Student</dt><dd className="font-medium">{s.full_name}</dd><dt className="text-mute">Class</dt><dd>{cls.name}-{cls.section}</dd><dt className="text-mute">Admission no.</dt><dd>{s.admission_no}</dd><dt className="text-mute">Guardian</dt><dd>{s.guardian_name}</dd></dl>
            <table className="w-full border-collapse text-sm"><thead><tr className="bg-line text-left"><th className="border border-line p-2">Subject</th><th className="border border-line p-2">Marks</th><th className="border border-line p-2">Out of</th><th className="border border-line p-2">Grade</th></tr></thead>
              <tbody>{(subs ?? []).map((u, i) => <tr key={u.id}><td className="border border-line p-2">{u.name}</td><td className="border border-line p-2">{got[i] ?? "—"}</td><td className="border border-line p-2">{total}</td><td className="border border-line p-2">{got[i] === undefined ? "—" : grade((got[i]! / total) * 100)}</td></tr>)}
                <tr className="font-semibold"><td className="border border-line p-2">Total</td><td className="border border-line p-2">{sum}</td><td className="border border-line p-2">{max}</td><td className="border border-line p-2">{pct === null ? "—" : grade(pct)}</td></tr></tbody></table>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm"><div className="rounded border border-line p-2"><div className="text-xs text-mute">Percentage</div><b>{pct === null ? "—" : pct.toFixed(1) + "%"}</b></div><div className="rounded border border-line p-2"><div className="text-xs text-mute">Class position</div><b>{position(s.id) ?? "—"}</b></div><div className="rounded border border-line p-2"><div className="text-xs text-mute">Attendance</div><b>{apct === null ? "—" : apct + "%"}</b></div></div>
            {(r?.remark_en || r?.remark_ur) && <div className="mt-4 space-y-2 rounded border border-line p-3 text-sm"><p>{r.remark_en}</p><p dir="rtl" lang="ur" className="text-base leading-loose">{r.remark_ur}</p></div>}
            <footer className="mt-10 flex justify-between text-xs text-mute"><span>Class teacher: ____________</span><span>Principal: ____________</span><span>Parent: ____________</span></footer>
          </section>);
      })}
    </div>
  );
}
