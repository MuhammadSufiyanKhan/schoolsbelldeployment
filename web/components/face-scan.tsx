"use client";
import { useEffect, useRef, useState } from "react";

type Stu = { id: string; name: string; consent: boolean; template: number[] | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FA = any;
let lib: Promise<FA> | null = null;
export function loadFace(): Promise<FA> {
  lib ??= (async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.esm.js");
    await faceapi.tf.setBackend("webgl").catch(() => faceapi.tf.setBackend("cpu")); await faceapi.tf.ready();
    await Promise.all([faceapi.nets.ssdMobilenetv1.loadFromUri("/face-models"), faceapi.nets.faceLandmark68Net.loadFromUri("/face-models"), faceapi.nets.faceRecognitionNet.loadFromUri("/face-models")]);
    return faceapi;
  })();
  return lib;
}
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function FaceScan({ students, classId, save }: { students: Stu[]; classId: string; save: (fd: FormData) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "scanning" | "done">("idle"); const [err, setErr] = useState(""); const [seen, setSeen] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState<Record<string, string>>({}); const [date, setDate] = useState(today()); const [faces, setFaces] = useState(0);
  const known = students.filter((s) => s.consent && s.template);
  useEffect(() => () => stop(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  function stop() { if (timer.current) clearInterval(timer.current); timer.current = null; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }
  async function start() {
    setErr(""); setState("loading"); setSeen(new Set());
    try {
      const faceapi = await loadFace();
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      const v = video.current!; v.srcObject = stream.current; await v.play();
      const labelled = known.map((s) => ({ id: s.id, d: new Float32Array(s.template!) }));
      let busy = false;
      setState("scanning");
      timer.current = setInterval(async () => {
        if (busy || !video.current) return; busy = true;
        try {
          const found = await faceapi.detectAllFaces(video.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
          setFaces(found.length);
          const hit: string[] = [];
          for (const f of found) {
            const ranked = labelled.map((l) => ({ id: l.id, dist: faceapi.euclideanDistance(f.descriptor, l.d) })).sort((a, b) => a.dist - b.dist);
            if (ranked[0] && ranked[0].dist < 0.5 && (!ranked[1] || ranked[1].dist - ranked[0].dist > 0.04)) hit.push(ranked[0].id);   // strict, and never a coin-flip between two children
          }
          if (hit.length) setSeen((x) => { const n = new Set(x); hit.forEach((h) => n.add(h)); return n.size === x.size ? x : n; });
        } catch { /* skip a bad frame */ }
        busy = false;
      }, 700);
    } catch (e) { stop(); setState("idle"); setErr(e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message) ? "Camera access was refused. Allow the camera for this app." : "The camera or face models could not start. Check your connection the first time (the models are downloaded once)."); }
  }
  function finish() {
    stop(); setState("done");
    setMarks(Object.fromEntries(students.map((s) => [s.id, seen.has(s.id) ? "P" : "A"])));
  }
  const notSeen = students.filter((s) => !seen.has(s.id));
  return (
    <div className="space-y-4">
      {!known.length && <p className="rounded-lg border border-amber-500 p-3 text-sm">No child in this class is enrolled for face attendance yet. Record consent and enrol faces first (button above).</p>}
      {state !== "done" && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black"><video ref={video} playsInline muted className={`w-full ${state === "scanning" ? "" : "hidden"}`} />
            {state === "scanning" && <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Seen {seen.size} of {known.length} · {faces} face{faces === 1 ? "" : "s"} in view</div>}</div>
          {state === "idle" && <button onClick={start} disabled={!known.length} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">📱 Start scanning</button>}
          {state === "loading" && <p className="text-sm text-mute">Starting the camera and loading the face models…</p>}
          {state === "scanning" && <><p className="text-sm text-mute">Move the phone slowly across the class so every face is seen for a moment.</p><button onClick={finish} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Finish and review</button></>}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>)}
      {state === "done" && (
        <form action={save} className="space-y-3">
          <input type="hidden" name="class_id" value={classId} /><label className="block text-sm">Date<input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <input type="hidden" name="marks" value={JSON.stringify(marks)} />
          <p className="text-sm"><b>{seen.size}</b> recognised. <b>{notSeen.length}</b> not seen, listed below. Check them, change anyone, then save.</p>
          <div className="space-y-1">{students.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-1 text-sm"><span>{s.name}{!s.consent && <span className="ml-2 text-xs text-mute">no face consent: mark by hand</span>}{seen.has(s.id) && <span className="ml-2 text-xs text-teal-700 dark:text-teal-300">recognised</span>}</span>
              <select className="w-24" value={marks[s.id]} onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}><option value="P">Present</option><option value="A">Absent</option><option value="L">Late</option><option value="LV">Leave</option></select></div>))}</div>
          <div className="flex gap-2"><button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Save attendance</button><button type="button" onClick={() => setState("idle")} className="rounded-lg border border-line px-4 py-2 text-sm">Scan again</button></div>
        </form>)}
    </div>
  );
}
