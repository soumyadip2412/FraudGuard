import { useEffect, useState } from "react";

export const TABS = [
  { id: "check", label: "Check" },
  { id: "batch", label: "Batch" },
  { id: "log", label: "Log" },
  { id: "model", label: "Model" },
  { id: "guide", label: "Guide" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

function readHash(): TabId {
  const hash = window.location.hash.slice(1);
  return TABS.find((tab) => tab.id === hash)?.id ?? "check";
}

/** Current section from the URL hash (#log etc.), so sections are linkable and Back works. */
export function useHashTab(): TabId {
  const [tab, setTab] = useState(readHash);
  useEffect(() => {
    const onChange = () => setTab(readHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return tab;
}
