import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "./supabase/server";
import { isFamily, type Action, type Module, type Role } from "./perm";

export type Profile = { id: string; email: string; school_id: string; campus_id: string | null; role: Role; full_name: string; must_change_password: boolean };
export type Campus = { id: string; name: string };

export const getProfile = cache(async (): Promise<Profile | null> => {
  const sb = await supabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("id,school_id,campus_id,role,full_name,must_change_password").eq("id", user.id).maybeSingle();
  return data ? ({ ...data, email: user.email ?? "" } as Profile) : null;
});

/** Permissions come from the database (editable per school) and are loaded once per request. */
export const getPerms = cache(async (): Promise<Set<string>> => {
  const p = await getProfile();
  if (!p) return new Set();
  const sb = await supabase();
  const { data } = await sb.from("role_permissions").select("module,can_view,can_add,can_edit,can_approve,can_download").eq("role", p.role);
  const s = new Set<string>();
  for (const r of data ?? []) {
    if (r.can_view) s.add(`${r.module}:view`); if (r.can_add) s.add(`${r.module}:add`); if (r.can_edit) s.add(`${r.module}:edit`);
    if (r.can_approve) s.add(`${r.module}:approve`); if (r.can_download) s.add(`${r.module}:download`);
  }
  return s;
});
export const can = async (m: Module, a: Action = "view") => {
  const p = await getProfile();
  if (!p) return false;
  return p.role === "super_admin" || (await getPerms()).has(`${m}:${a}`);
};

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}
/** Server-side authorization for pages and actions. The database enforces the same rules again through RLS. */
export async function guard(m: Module, a: Action = "view"): Promise<Profile> {
  const p = await requireProfile();
  if (!(await can(m, a))) redirect(isFamily(p.role) ? "/portal" : "/?denied=1");
  return p;
}
export async function requireStaff(): Promise<Profile> {
  const p = await requireProfile();
  if (isFamily(p.role)) redirect("/portal");
  return p;
}
export async function requireFamily(): Promise<Profile> {
  const p = await requireProfile();
  if (!isFamily(p.role)) redirect("/");
  return p;
}

/** Campus that new rows are written to / that screens are filtered to.
 *  Campus staff: always their own campus. Head office / super admin: the one picked in the switcher (or the first). */
export const getCampuses = cache(async (): Promise<Campus[]> => {
  const sb = await supabase();
  const { data } = await sb.from("campuses").select("id,name").order("name");
  return data ?? [];
});
export const activeCampus = cache(async (): Promise<Campus | null> => {
  const p = await getProfile();
  if (!p) return null;
  const all = await getCampuses();
  if (p.campus_id) return all.find((c) => c.id === p.campus_id) ?? null;
  const picked = (await cookies()).get("sw_campus")?.value;
  return all.find((c) => c.id === picked) ?? all[0] ?? null;
});

/** Campus filter for lists and counts: campus staff are limited to their own (RLS enforces it too);
 *  head office / super admin see every campus unless they picked one in the switcher. */
export const scopeCampusId = cache(async (): Promise<string | null> => {
  const p = await getProfile();
  if (!p) return null;
  if (p.campus_id) return p.campus_id;
  const picked = (await cookies()).get("sw_campus")?.value;
  const all = await getCampuses();
  return all.find((c) => c.id === picked)?.id ?? null;
});
