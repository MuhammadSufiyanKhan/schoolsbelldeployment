import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson } from "@/lib/ai";
import { aiStaff, aiFail } from "@/lib/ai-route";

export const maxDuration = 60;
const s = z.union([z.string(), z.number()]).transform(String).optional().catch(undefined);
const Out = z.object({ applicant_name: s, dob: s, guardian_name: s, guardian_phone: s, guardian_email: s, notes: s });

export async function POST(req: Request) {
  const g = await aiStaff("admissions", "add"); if ("res" in g) return g.res;
  const fd = await req.formData().catch(() => null); const f = fd?.get("image");
  if (!fd || !(f instanceof File) || !f.size || f.size > 6 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(f.type)) return NextResponse.json({ error: "Send one photo (under 6 MB)." }, { status: 400 });
  try {
    const out = await askJson(Out, { who: g.p.id, maxOutputTokens: 1500, images: [{ data: Buffer.from(await f.arrayBuffer()), mediaType: f.type }],
      system: "You read a photo of a child's B-form (CRC) or a school admission form and extract the details. Copy only what is printed or written; leave a field out if you cannot read it. dob must be YYYY-MM-DD. " +
        'Guardian means the father or guardian. Put anything else useful (B-form number, address, previous school) in notes. Reply with ONLY JSON: {"applicant_name":"","dob":"2018-03-25","guardian_name":"","guardian_phone":"","guardian_email":"","notes":""}',
      user: "Read this form." });
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(out.dob ?? "") ? out.dob : "";
    return NextResponse.json({ ...out, dob });
  } catch (e) { return aiFail(e); }
}
