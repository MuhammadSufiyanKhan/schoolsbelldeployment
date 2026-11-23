import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card, Field, Btn, Flash, str, type SP, first } from "@/components/ui";

async function login(fd: FormData) {
  "use server";
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({ email: str(fd, "email").toLowerCase(), password: str(fd, "password") });
  if (error) redirect("/login?err=Wrong+email+or+password");
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: SP }) {
  if (await getProfile()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <Card className="w-full space-y-4">
        <div><div className="text-2xl font-bold text-brand">Schoolwell</div><p className="text-sm text-mute">Sign in to your school.</p></div>
        <Flash err={first(sp.err)} msg={first(sp.msg)} />
        <form action={login} className="space-y-3">
          <Field label="Email"><input name="email" type="email" required autoComplete="username" /></Field>
          <Field label="Password"><input name="password" type="password" required autoComplete="current-password" /></Field>
          <Btn className="w-full">Sign in</Btn>
        </form>
        <p className="text-center text-sm text-mute">Parent? <Link href="/join" className="text-brand underline">Join with your child&apos;s details</Link></p>
      </Card>
    </main>
  );
}
