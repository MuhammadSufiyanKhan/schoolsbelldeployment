import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson } from "@/lib/ai";
import { aiStaff, aiFail } from "@/lib/ai-route";

export const maxDuration = 60;
const Out = z.object({ roll_no: z.union([z.string(), z.number()]).transform(String).catch(""), answers: z.array(z.union([z.string(), z.number(), z.null()]).transform((v) => String(v ?? "").trim().toUpperCase())).catch([]), note: z.string().optional().catch(undefined) });

export async function POST(req: Request) {
  const g = await aiStaff("exams", "add"); if ("res" in g) return g.res;
  const fd = await req.formData().catch(() => null); const f = fd?.get("image");
  if (!fd || !(f instanceof File) || !f.size || f.size > 6 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(f.type)) return NextResponse.json({ error: "Send one photo of the sheet (under 6 MB)." }, { status: 400 });
  const n = Math.min(100, Math.max(1, Number(fd.get("questions")) || 20)), opts = Math.min(6, Math.max(2, Number(fd.get("options")) || 4));
  const letters = "ABCDEF".slice(0, opts).split("").join(", ");
  try {
    const out = await askJson(Out, { who: g.p.id, maxOutputTokens: 3000, images: [{ data: Buffer.from(await f.arrayBuffer()), mediaType: f.type }],
      system: `You read an OMR bubble answer sheet from a photo. The sheet has a roll number written or bubbled at the top, and ${n} questions, each with options ${letters}. ` +
        'For each question 1..' + n + ' give the letter whose bubble is filled. Use "" if no bubble is filled and "*" if more than one is filled. Be careful: do not guess. ' +
        `Reply with ONLY JSON: {"roll_no":"12","answers":["A","C","","B"],"note":"anything unclear"} where answers has exactly ${n} entries in question order.`,
      user: "Read this sheet." });
    const answers = Array.from({ length: n }, (_, i) => (out.answers[i] ?? "").slice(0, 1) || (out.answers[i] === "*" ? "*" : ""));
    return NextResponse.json({ roll_no: out.roll_no.trim(), answers, note: out.note ?? "" });
  } catch (e) { return aiFail(e); }
}
