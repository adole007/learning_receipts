"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = {
  status: string;
  detail: string | null;
  sources: { url: string; title: string | null; status: string; error: string | null }[];
  modulesReady: number;
  modulesTotal: number;
};

/** Polls processing status; refreshes the server page when the pathway changes state. */
export function StatusPoller({ pathwayId, initialStatus, compact = false }: { pathwayId: string; initialStatus: string; compact?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    let last = initialStatus;
    let lastReady = -1;
    const tick = async () => {
      try {
        const res = await fetch(`/api/pathways/${pathwayId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data: Status = await res.json();
        if (!alive) return;
        setS(data);
        if (data.status !== last || (lastReady >= 0 && data.modulesReady !== lastReady)) router.refresh();
        last = data.status;
        lastReady = data.modulesReady;
        const done = data.status === "FAILED" || (data.status === "READY" && data.modulesReady >= data.modulesTotal);
        if (done) return;
      } catch {
        /* retry */
      }
      if (alive) setTimeout(tick, 3000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [pathwayId, initialStatus, router]);

  if (compact) {
    if (!s || s.status !== "READY" || s.modulesReady >= s.modulesTotal) return null;
    return (
      <div className="card row small">
        <span className="spinner" /> Generating verified assessments — {s.modulesReady}/{s.modulesTotal} modules done.
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="row">
        <span className="spinner" />
        <strong>{s?.detail ?? "Starting…"}</strong>
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {(s?.sources ?? []).map((src) => (
          <li key={src.url}>
            <span className={`pill ${src.status === "OK" ? "ok" : src.status === "FAILED" ? "bad" : ""}`}>{src.status}</span>{" "}
            {src.title ?? src.url}
            {src.error && <div className="muted">{src.error}</div>}
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>You can leave this page — processing continues in the background.</p>
    </div>
  );
}
