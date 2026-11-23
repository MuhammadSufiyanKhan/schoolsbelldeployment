"use client";
import { useEffect, useState } from "react";

const isUrdu = (t: string) => /[؀-ۿ]/.test(t);

/** Reads text aloud with the device's own text-to-speech (free, no AI service). Urdu text uses an Urdu voice when the device has one. */
export default function Speak({ text, label = "Listen" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "speaking" | "novoice">("idle");
  const [urduVoice, setUrduVoice] = useState(true);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const check = () => setUrduVoice(speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("ur")));
    check(); speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => { speechSynthesis.removeEventListener?.("voiceschanged", check); speechSynthesis.cancel(); };
  }, []);
  if (typeof window !== "undefined" && !("speechSynthesis" in window)) return null;
  const urdu = isUrdu(text);
  function toggle() {
    if (state === "speaking") { speechSynthesis.cancel(); setState("idle"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = urdu ? "ur-PK" : "en-US";
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(urdu ? "ur" : "en"));
    if (v) u.voice = v;
    u.onend = u.onerror = () => setState("idle");
    speechSynthesis.cancel(); speechSynthesis.speak(u); setState("speaking");
  }
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={toggle} className="rounded-lg border border-line px-3 py-1 text-sm font-semibold">{state === "speaking" ? "⏹ Stop" : `🔊 ${label}`}</button>
      {urdu && !urduVoice && <span className="mt-1 max-w-xs text-xs text-mute">This device has no Urdu voice. Android: Settings → Languages → Text-to-speech → install Urdu. Windows: Settings → Time &amp; language → Speech → Add voices.</span>}
    </span>
  );
}
