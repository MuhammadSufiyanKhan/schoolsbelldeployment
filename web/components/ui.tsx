import Link from "next/link";
import type { ReactNode } from "react";

export const money = (n: number | null | undefined) => "PKR " + Number(n ?? 0).toLocaleString();
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex-1"><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="text-sm text-mute">{sub}</p>}</div>
      {children}
    </div>
  );
}
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</div>
);
export const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <Card><div className="text-2xl font-bold">{value}</div><div className="text-sm text-mute">{label}</div></Card>
);
export function Btn({ children, variant = "primary", ...p }: { variant?: "primary" | "ghost" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const c = { primary: "bg-brand text-white dark:text-black", ghost: "border border-line", danger: "bg-red-600 text-white" }[variant];
  return <button {...p} className={`rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 ${c} ${p.className ?? ""}`}>{children}</button>;
}
export const LinkBtn = ({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) => (
  <Link href={href} className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 ${ghost ? "border border-line" : "bg-brand text-white dark:text-black"}`}>{children}</Link>
);
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-mute"><span className="mb-1 block">{label}</span>{children}</label>;
}
export const Badge = ({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "mute" }) => {
  const c = { ok: "bg-teal-500/15 text-teal-700 dark:text-teal-300", warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300", bad: "bg-red-500/15 text-red-700 dark:text-red-300", mute: "bg-line text-mute" }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
};
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="border-b border-line text-left text-xs uppercase text-mute">{head.map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody className="[&_td]:px-2 [&_td]:py-2 [&_tr]:border-b [&_tr]:border-line">{children}</tbody>
    </table>{empty && <p className="py-6 text-center text-sm text-mute">{empty}</p>}</div>
  );
}
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${err ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-teal-500/15 text-teal-800 dark:text-teal-300"}`}>{err || msg}</div>;
}
export const Grid = ({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => (
  <div className={`grid grid-cols-2 gap-3 ${cols === 4 ? "md:grid-cols-4" : cols === 3 ? "md:grid-cols-3" : ""}`}>{children}</div>
);
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string) => Number(fd.get(k) || 0);
export type SP = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
