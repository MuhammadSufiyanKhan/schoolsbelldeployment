"use client";
import { useState } from "react";
import { loadFace } from "./face-scan";

export default function FaceEnrol({ studentId, name, enrolled, enrol }: { studentId: string; name: string; enrolled: boolean; enrol: (id: string, d: number[]) => Promise<{ ok: boolean; message: string }> }) {
  const [msg, setMsg] = useState(enrolled ? "Enrolled" : ""); const [busy, setBusy] = useState(false);
  async function go(f: File) {
    setBusy(true); setMsg("Reading the face…");
    try {
      const faceapi = await loadFace(); const img = await faceapi.bufferToImage(f);
      const all = await faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })).withFaceLandmarks().withFaceDescriptors();
      if (all.length !== 1) setMsg(all.length ? "More than one face in the photo. Photograph only this child." : "No clear face found. Use good light and look at the camera.");
      else { const r = await enrol(studentId, Array.from(all[0].descriptor as Float32Array)); setMsg(r.ok ? "Enrolled" : r.message); }
    } catch { setMsg("Could not start the face models. Check your connection."); }
    setBusy(false);
  }
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-24 text-xs text-mute" aria-label={`Face for ${name}`}>{msg}</span>
      <input type="file" accept="image/*" capture="user" disabled={busy} onChange={(e) => e.target.files?.[0] && void go(e.target.files[0])} /></label>
  );
}
