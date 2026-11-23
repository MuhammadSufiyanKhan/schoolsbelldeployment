import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { isFamily } from "@/lib/perm";
import { ilmi } from "@/lib/ilmi";
import { AiError } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const p = await getProfile();
  if (!p || isFamily(p.role)) return NextResponse.json({ error: "Staff only." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { message?: string; today?: string };
  const message = String(body.message ?? "").trim().slice(0, 800);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? "") ? body.today! : new Date().toISOString().slice(0, 10);   // the device's local date
  if (!message) return NextResponse.json({ error: "Type a request." }, { status: 400 });
  try { return NextResponse.json(await ilmi(p, message, today)); }
  catch (e) { return NextResponse.json({ error: e instanceof AiError ? e.userMessage : "Ilmi could not do that. Please try again." }, { status: 502 }); }
}
