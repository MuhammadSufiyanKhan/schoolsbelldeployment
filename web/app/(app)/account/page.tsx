import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { Card, Field, Btn, Flash, PageHeader, str, first, type SP } from "@/components/ui";

async function change(fd: FormData) {
  "use server";
  const p = await requireProfile();
  const sb = await supabase();
  const next = str(fd, "next");
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) redirect("/account?err=Use+at+least+8+characters+with+letters+and+numbers");
  const check = await sb.auth.signInWithPassword({ email: p.email, password: str(fd, "current") });
  if (check.error) redirect("/account?err=Current+password+is+wrong");
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) redirect("/account?err=" + encodeURIComponent(error.message));
  await admin().from("profiles").update({ must_change_password: false }).eq("id", p.id); // users cannot edit their own profile row (it holds the role)
  redirect("/account?msg=Password+updated");
}

export default async function Account({ searchParams }: { searchParams: SP }) {
  const p = await requireProfile();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Account" sub={`${p.full_name} · ${p.email}`} />
      <Flash msg={first(sp.msg)} err={first(sp.err) ?? (p.must_change_password ? "Please change your temporary password." : undefined)} />
      <Card className="max-w-md"><h2 className="mb-3 font-semibold">Change password</h2>
        <form action={change} className="space-y-3"><Field label="Current password"><input type="password" name="current" required /></Field>
          <Field label="New password (8+ characters, letters and numbers)"><input type="password" name="next" required minLength={8} /></Field><Btn>Update</Btn></form></Card>
    </>
  );
}
