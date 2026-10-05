"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inFlight = new Map<string, Promise<string | null>>();

/** Generates a module's questions; concurrent callers for the same module share one request. Resolves to an error message or null. */
export function generateModule(moduleId: string): Promise<string | null> {
  let p = inFlight.get(moduleId);
  if (!p) {
    p = fetch(`/api/modules/${moduleId}/generate`, { method: "POST" })
      .then(async (res) => (res.ok ? null : ((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`)))
      .catch((e: Error) => e.message || "Network error")
      .finally(() => inFlight.delete(moduleId));
    inFlight.set(moduleId, p);
  }
  return p;
}

export function GenerateButton({ moduleId, label = "Generate assessments" }: { moduleId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row">
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          setErr(await generateModule(moduleId));
          setBusy(false);
          router.refresh();
        }}
      >
        {busy && <span className="spinner" />} {busy ? "Generating & verifying…" : label}
      </button>
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
    </span>
  );
}
