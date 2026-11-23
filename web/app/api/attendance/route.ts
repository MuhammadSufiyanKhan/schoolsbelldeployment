import { NextResponse } from "next/server";
import { getProfile, can } from "@/lib/auth";
import { saveAttendance } from "@/lib/attendance";

// Offline sync endpoint: the browser posts attendance it saved while there was no connection.
export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await can("attendance", "add"))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const b = body as { date?: string; class_id?: string; marks?: Record<string, string> };
  const r = await saveAttendance(p, { date: String(b.date ?? ""), class_id: String(b.class_id ?? ""), marks: b.marks ?? {} });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
