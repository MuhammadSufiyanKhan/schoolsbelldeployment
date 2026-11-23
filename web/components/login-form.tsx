"use client";
import { useActionState, useEffect, useState } from "react";

export type LoginState = { error?: string; ok?: boolean };

/** Sign-in form. Keyboards on phones and in desktop shells often capitalise or "correct" text, so those are switched off,
 *  the password can be revealed to check for typos, and the reason for a failure is shown honestly. */
export default function LoginForm({ action }: { action: (prev: LoginState, fd: FormData) => Promise<LoginState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [show, setShow] = useState(false);
  // A full page load after sign-in guarantees the new session cookie is sent, in browsers, the Android app and the desktop app alike.
  useEffect(() => { if (state.ok) window.location.assign("/"); }, [state.ok]);
  const field = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-brand";
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <div role="alert" className="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-700 dark:text-red-300">{state.error}</div>}
      <label className="block text-xs font-medium text-mute"><span className="mb-1 block">Email</span>
        <input name="email" type="email" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" className={field} /></label>
      <label className="block text-xs font-medium text-mute"><span className="mb-1 block">Password</span>
        <span className="relative block">
          <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={field + " pr-16"} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-semibold text-brand">{show ? "Hide" : "Show"}</button>
        </span></label>
      <button disabled={pending || state.ok} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 dark:text-black">{pending || state.ok ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
