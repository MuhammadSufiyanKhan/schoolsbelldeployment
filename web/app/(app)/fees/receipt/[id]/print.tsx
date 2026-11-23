"use client";
export default function Print() {
  return <button onClick={() => window.print()} className="print:hidden w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Print receipt</button>;
}
