import { redirect } from "next/navigation";
import Link from "next/link";
import { admin } from "@/lib/supabase/admin";
import { supabase } from "@/lib/supabase/server";
import { Card, Field, Btn, Flash, str, first, type SP } from "@/components/ui";

// Public parent sign-up. Uses the service role because the visitor has no account yet; every outcome that
// could reveal whether a child exists returns the same generic message.
async function join(fd: FormData) {
  "use server";
  const fail = (m: string) => redirect("/join?err=" + encodeURIComponent(m));
  const no = str(fd, "admission_no"), dob = str(fd, "dob"), email = str(fd, "email").toLowerCase(), password = str(fd, "password"), name = str(fd, "full_name");
  if (!no || !dob || !email || !name) fail("Please fill in every field.");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) fail("Use a password of at least 8 characters with letters and numbers.");
  const db = admin();
  const { data: st } = await db.from("students").select("id,school_id,campus_id,guardian_email,status").eq("admission_no", no).eq("dob", dob).maybeSingle();
  if (!st || st.status !== "active") fail("We couldn't match those details. Check the roll number and date of birth, or ask the school.");
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) fail("An account with this email may already exist. Try signing in, or use a different email.");
  const uid = created.data!.user!.id;
  await db.from("profiles").insert({ id: uid, school_id: st!.school_id, campus_id: st!.campus_id, role: "parent", full_name: name, must_change_password: false });
  const matches = !!st!.guardian_email && st!.guardian_email.toLowerCase() === email; // email on record → approved at once
  await db.from("student_guardians").insert({ student_id: st!.id, user_id: uid, school_id: st!.school_id, status: matches ? "confirmed" : "pending" });
  await (await supabase()).auth.signInWithPassword({ email, password });
  redirect("/portal");
}

export default async function Join({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4 py-8">
      <Card className="w-full space-y-4">
        <div><div className="text-2xl font-bold text-brand">Parent sign-up</div><p className="text-sm text-mute">Confirm your child, then create your account. You will only ever see your own children.</p></div>
        <Flash err={first(sp.err)} />
        <form action={join} className="space-y-3">
          <Field label="Child's roll / admission number"><input name="admission_no" required /></Field>
          <Field label="Child's date of birth"><input type="date" name="dob" required /></Field>
          <Field label="Your name"><input name="full_name" required /></Field>
          <Field label="Your email"><input type="email" name="email" required autoComplete="username" /></Field>
          <Field label="Password (8+ characters, letters and numbers)"><input type="password" name="password" required minLength={8} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
          <Btn className="w-full">Create account</Btn>
        </form>
        <p className="text-center text-sm text-mute">Already have an account? <Link href="/login" className="text-brand underline">Sign in</Link></p>
      </Card>
    </main>
  );
}
