"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
          const res = await fetch(`/api/modules/${moduleId}/generate`, { method: "POST" });
          if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Failed");
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
