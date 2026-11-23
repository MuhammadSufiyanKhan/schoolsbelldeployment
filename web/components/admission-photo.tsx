"use client";
import { useRef, useState } from "react";

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}
/** Fills the enquiry form that sits next to it. Nothing is saved: staff read each field and press Save themselves. */
export default function AdmissionPhoto() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const ref = useRef<HTMLDivElement>(null);
  async function read(f: File) {
    setBusy(true); setMsg("");
    try {
      const fd = new FormData(); fd.set("image", await shrink(f), "form.jpg");
      const r = await fetch("/api/ai/admission", { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Failed"); } else {
        const form = ref.current?.closest("form"); let n = 0;
        for (const k of ["applicant_name", "dob", "guardian_name", "guardian_phone", "guardian_email", "notes"]) { const el = form?.elements.namedItem(k) as HTMLInputElement | null; if (el && j[k]) { el.value = j[k]; n++; } }
        setMsg(n ? `Filled ${n} fields. Please check each one before saving.` : "I could not read any details. Try a clearer, flatter photo.");
      }
    } catch { setMsg("No connection. The AI needs internet."); }
    setBusy(false);
  }
  return (
    <div ref={ref} data-online-only="" className="rounded-lg bg-line/50 p-3 text-sm">
      <label className="block font-semibold">📷 Fill from a photo of the B-form or admission form<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} /></label>
      {busy && <p className="text-mute">Reading…</p>}{msg && <p className="mt-1 text-mute">{msg}</p>}
    </div>
  );
}
