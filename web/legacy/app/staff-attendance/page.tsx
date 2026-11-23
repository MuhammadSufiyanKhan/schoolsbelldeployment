import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { Card, PageHeader, Table, Btn, Flash, today, str, first, type SP } from "@/components/ui";

async function mark(fd: FormData) {
  "use server";
  await guard("staffAttendance", true);
  const date = str(fd, "date");
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("s_")) continue;
    run("INSERT INTO staff_attendance(staff_id,date,status) VALUES(?,?,?) ON CONFLICT(staff_id,date) DO UPDATE SET status=excluded.status", Number(k.slice(2)), date, String(v));
  }
  revalidatePath("/staff-attendance");
  redirect(`/staff-attendance?date=${date}&msg=Attendance+saved`);
}

export default async function StaffAttendance({ searchParams }: { searchParams: SP }) {
  await guard("staffAttendance");
  const sp = await searchParams;
  const date = first(sp.date) || today();
  const rows = all<{ id: number; name: string; designation: string; status: string | null }>("SELECT s.id,s.name,s.designation,(SELECT status FROM staff_attendance WHERE staff_id=s.id AND date=?) status FROM staff s WHERE s.status!='resigned' ORDER BY s.name", date);
  return (
    <>
      <PageHeader title="Staff attendance" />
      <Flash msg={first(sp.msg)} />
      <Card>
        <form className="mb-4 flex items-end gap-2"><input type="date" name="date" defaultValue={date} className="max-w-[12rem]" /><button className="rounded-lg border border-line px-4 py-2 text-sm">Go</button></form>
        <form action={mark}><input type="hidden" name="date" value={date} />
          <Table head={["Staff", "Designation", "Status"]}>
            {rows.map((r) => <tr key={r.id}><td className="font-medium">{r.name}</td><td>{r.designation}</td><td><div className="flex gap-3 text-sm">{[["P", "Present"], ["A", "Absent"], ["L", "Leave"]].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="radio" name={`s_${r.id}`} value={v} defaultChecked={(r.status ?? "P") === v} />{l}</label>)}</div></td></tr>)}
          </Table>
          <div className="mt-4"><Btn>Save attendance</Btn></div></form>
      </Card>
    </>
  );
}
