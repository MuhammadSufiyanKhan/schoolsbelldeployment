import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { isFamily } from "@/lib/perm";
import { confirmProposal } from "@/lib/ilmi";

export async function POST(req: Request) {
  const p = await getProfile();
  if (!p || isFamily(p.role)) return NextResponse.json({ ok: false, message: "Staff only." }, { status: 401 });
  const r = await confirmProposal(p, await req.json().catch(() => ({})));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
