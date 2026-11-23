"use client";
export default function SignOut({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} onSubmit={(e) => {
      let waiting = 0;
      try { waiting = JSON.parse(localStorage.getItem("sw_att_queue") || "[]").length; } catch { /* ignore */ }
      if (waiting && !confirm(`${waiting} attendance sheet(s) have not been sent yet and will be lost if you sign out. Sign out anyway?`)) { e.preventDefault(); return; }
      try { localStorage.removeItem("sw_att_queue"); localStorage.removeItem("sw_warm"); } catch { /* ignore */ }
      if ("caches" in window) void caches.keys().then((k) => k.forEach((n) => caches.delete(n))); // nothing from this account stays on a shared device
    }}>
      <button className="flex w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-mute hover:bg-line">↩ Sign out</button>
    </form>
  );
}
