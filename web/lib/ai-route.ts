import "server-only";
import { NextResponse } from "next/server";
import { getProfile, can, type Profile } from "./auth";
import { isFamily, type Module, type Action } from "./perm";
import { AiError } from "./ai";

/** Shared door for the AI endpoints: staff only, and only people who may do the matching action in the app. */
export async function aiStaff(mod: Module, action: Action = "add"): Promise<{ p: Profile } | { res: NextResponse }> {
  const p = await getProfile();
  if (!p || isFamily(p.role)) return { res: NextResponse.json({ error: "Staff only." }, { status: 401 }) };
  if (!(await can(mod, action))) return { res: NextResponse.json({ error: "You don't have permission for this." }, { status: 403 }) };
  return { p };
}
export const aiFail = (e: unknown) => NextResponse.json({ error: e instanceof AiError ? e.userMessage : "The AI could not do that. Please try again." }, { status: 502 });
