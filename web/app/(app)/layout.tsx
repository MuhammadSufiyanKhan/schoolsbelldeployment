import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile, getCampuses, scopeCampusId, getPerms } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { NAV, ROLE_LABEL, isFamily, type Module } from "@/lib/perm";
import SignOut from "@/components/sign-out";
import OfflineBanner from "@/components/offline-banner";
import OfflineWarmup from "@/components/offline-warmup";

async function logout() {
  "use server";
  await (await supabase()).auth.signOut();
  redirect("/login");
}
async function pickCampus(fd: FormData) {
  "use server";
  (await cookies()).set("sw_campus", String(fd.get("campus") ?? "all"), { path: "/", maxAge: 31536000 });
  redirect(String(fd.get("back") || "/"));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [p, perms] = await Promise.all([requireProfile(), getPerms()]);
  const family = isFamily(p.role);
  const sb = await supabase();
  const allowed = (m: Module) => p.role === "super_admin" || perms.has(`${m}:view`);
  const items = NAV.filter((n) => !(n.roles && !n.roles.includes(p.role)) && !(n.family ? !family : n.staffOnly ? family : n.mod ? !allowed(n.mod) : false));
  const [campuses, schoolRes, current] = await Promise.all([getCampuses(), sb.from("schools").select("name").maybeSingle(), scopeCampusId()]);
  const school = schoolRes.data;
  const multi = !p.campus_id && campuses.length > 0;
  return (
    <div className="md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white dark:text-black">S</span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{school?.name ?? "Schoolwell"}</div><div className="truncate text-xs text-mute">{ROLE_LABEL[p.role]} · {p.full_name}</div></div>
        </div>
        {multi && (
          <form action={pickCampus} className="flex gap-1 px-3 pb-2"><input type="hidden" name="back" value="/" />
            <select name="campus" defaultValue={current ?? "all"} className="!py-1 text-xs"><option value="all">All campuses</option>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="rounded-lg border border-line px-2 text-xs">Go</button></form>
        )}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-0.5 md:pb-4">
          {items.map((n) => <Link key={n.href} href={n.href} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-mute hover:bg-line hover:text-fg"><span>{n.icon}</span>{n.label}</Link>)}
          <Link href="/account" className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-mute hover:bg-line">🔒 Account</Link>
          <SignOut action={logout} />
        </nav>
      </aside>
      <main className="min-w-0 p-4 md:p-8"><OfflineBanner /><OfflineWarmup uid={p.id} />{p.must_change_password && <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">You are using a temporary password. <Link href="/account" className="font-semibold underline">Change it now</Link>.</div>}{children}</main>
    </div>
  );
}
