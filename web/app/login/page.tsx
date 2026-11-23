import { redirect } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import LoginForm, { type LoginState } from "@/components/login-form";
import { Card, str, type SP, first } from "@/components/ui";

async function login(_prev: LoginState, fd: FormData): Promise<LoginState> {
  "use server";
  const email = str(fd, "email").toLowerCase(), password = str(fd, "password");   // trimmed, like every password set through the app (keyboards often add a trailing space)
  try {
    const { error } = await (await supabase()).auth.signInWithPassword({ email, password });
    if (error) {
      // Only a genuine credentials problem says "wrong password"; anything else is reported as what it is.
      if (error.code === "invalid_credentials") return { error: "Wrong email or password. Tap Show to check what you typed." };
      if (error.status === 429 || error.code === "over_request_rate_limit") return { error: "Too many attempts. Please wait a minute and try again." };
      return { error: `Sign-in problem: ${error.message}` };
    }
  } catch {
    return { error: "Could not reach the server. Check your internet connection and try again." };
  }
  return { ok: true };
}

export default async function Login({ searchParams }: { searchParams: SP }) {
  if (await getProfile()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <Card className="w-full space-y-4">
        <div><div className="text-2xl font-bold text-brand">Schoolwell</div><p className="text-sm text-mute">Sign in to your school.</p></div>
        {first(sp.err) && <div className="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-700 dark:text-red-300">{first(sp.err)}</div>}
        <LoginForm action={login} />
        <p className="text-center text-sm text-mute">Parent? <Link href="/join" className="text-brand underline">Join with your child&apos;s details</Link></p>
      </Card>
    </main>
  );
}
