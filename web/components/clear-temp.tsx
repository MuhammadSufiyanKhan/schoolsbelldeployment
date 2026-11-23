"use client";
import { useEffect } from "react";
/** Deletes the one-time temporary-password cookie as soon as the page has shown it, so a reload cannot show it again. */
export default function ClearTemp({ action }: { action: () => Promise<void> }) {
  useEffect(() => { void action(); }, [action]);
  return null;
}
