"use client";
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return <button onClick={() => window.print()} className="print:hidden rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">{label}</button>;
}
