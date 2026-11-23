"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Student = { id: string; admission_no: string; full_name: string };
type Item = { date: string; class_id: string; marks: Record<string, string> };
const KEY = "sw_att_queue";
const OPTIONS: [string, string][] = [["P", "Present"], ["A", "Absent"], ["L", "Late"], ["LV", "Leave"]];

const readQueue = (): Item[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const writeQueue = (q: Item[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full or blocked */ } };

async function post(item: Item) {
  const r = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  if (r.status === 401 || r.status === 403) throw new Error("auth");
  return r.ok;
}

/** Attendance marking that keeps working without internet: unsent days are stored on this device and
 *  sent automatically when the connection returns. Later marks for the same class and day replace earlier ones. */
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function AttendanceForm({ students, initial, classId, date: serverDate, explicitDate, canMark }: { students: Student[]; initial: Record<string, string>; classId: string; date: string; explicitDate: boolean; canMark: boolean }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(students.map((s) => [s.id, initial[s.id] ?? "P"])));
  const [date, setDate] = useState(serverDate);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(0);

  const sync = useCallback(async () => {
    let q = readQueue();
    const left: Item[] = [];
    let sent = 0;
    for (const item of q) {
      try { if (await post(item)) sent++; else left.push(item); } catch { left.push(item); }
    }
    writeQueue(left); setPending(left.length);
    if (sent) { setMsg(`Synced ${sent} saved attendance ${sent === 1 ? "sheet" : "sheets"}.`); router.refresh(); }
    q = left;
  }, [router]);

  // The server's clock is UTC, which can be "yesterday" in the school's time zone, and a saved offline copy can be days old.
  // So unless a date was chosen, the sheet uses today's date on this device.
  useEffect(() => {
    if (explicitDate) return;
    const local = localToday();
    if (local === serverDate) return;
    if (navigator.onLine) router.replace(`/attendance?class_id=${classId}&date=${local}`);        // reload with that day's real marks
    else { setDate(local); setMarks(Object.fromEntries(students.map((s) => [s.id, "P"]))); }    // offline: start a fresh sheet for today
  }, [explicitDate, serverDate, classId, router, students]);

  useEffect(() => {
    setPending(readQueue().length);
    if (navigator.onLine && readQueue().length) void sync();
    const on = () => void sync();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [sync]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const item: Item = { date, class_id: classId, marks };
    if (navigator.onLine) {
      try { if (await post(item)) { setMsg("Attendance saved."); router.refresh(); return; } } catch { /* fall through to the offline queue */ }
    }
    const q = readQueue().filter((x) => !(x.date === date && x.class_id === classId));
    writeQueue([...q, item]); setPending(q.length + 1);
    setMsg("No connection: saved on this device. It will be sent automatically when you're back online.");
  }

  return (
    <form onSubmit={submit} data-offline-ok="">
      <p className="mb-2 text-sm text-mute">Date: <b className="text-fg">{date}</b>{!explicitDate && date !== serverDate && " (today on this device)"}</p>
      {pending > 0 && <div className="mb-3 rounded-lg bg-amber-500/15 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">{pending} attendance {pending === 1 ? "sheet is" : "sheets are"} waiting to be sent. <button type="button" onClick={() => void sync()} className="underline">Send now</button></div>}
      {msg && <div className="mb-3 rounded-lg bg-teal-500/15 px-4 py-2 text-sm text-teal-800 dark:text-teal-300">{msg}</div>}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs uppercase text-mute"><th className="px-2 py-2">Adm #</th><th className="px-2 py-2">Student</th><th className="px-2 py-2">Status</th></tr></thead>
        <tbody>{students.map((s) => (
          <tr key={s.id} className="border-b border-line"><td className="px-2 py-2">{s.admission_no}</td><td className="px-2 py-2 font-medium">{s.full_name}</td>
            <td className="px-2 py-2"><div className="flex flex-wrap gap-3">{OPTIONS.map(([v, l]) => (
              <label key={v} className="flex items-center gap-1"><input type="radio" name={`s_${s.id}`} value={v} disabled={!canMark} checked={marks[s.id] === v} onChange={() => setMarks((m) => ({ ...m, [s.id]: v }))} />{l}</label>))}</div></td></tr>))}</tbody>
      </table></div>
      {!students.length && <p className="py-6 text-center text-sm text-mute">No students in this class.</p>}
      {canMark && students.length > 0 && <button className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Save attendance</button>}
    </form>
  );
}
