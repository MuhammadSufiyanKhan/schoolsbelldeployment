"use client";
import { useActionState } from "react";

type Opt = { id: string; name: string };
export type SlotState = { error?: string };

/** One timetable cell. The server action returns the database's message (e.g. "Teacher already booked in 8-A at this time")
 *  and it is shown right here in the cell instead of through a page redirect. */
export default function SlotForm({ action, classId, day, period, subjects, rooms, subjectId, roomId }: {
  action: (prev: SlotState, fd: FormData) => Promise<SlotState>; classId: string; day: number; period: number;
  subjects: Opt[]; rooms: Opt[]; subjectId: string; roomId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} data-online-only="" className="space-y-1">
      <input type="hidden" name="class_id" value={classId} /><input type="hidden" name="day" value={day} /><input type="hidden" name="period" value={period} />
      <select name="subject_id" defaultValue={subjectId} className="!px-1 !py-1 text-xs"><option value="">—</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select name="room_id" defaultValue={roomId} className="!px-1 !py-1 text-[11px]"><option value="">no room</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <button disabled={pending} className="text-[10px] text-brand">{pending ? "saving…" : "set"}</button>
      {state.error && <p role="alert" className="text-[11px] leading-tight text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
