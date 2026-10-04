"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ShareToggle({ pathwayId, isPublic, slug, displayName }: { pathwayId: string; isPublic: boolean; slug: string; displayName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(displayName);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/pathways/${pathwayId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="stack">
      <div>
        <label htmlFor="dn">Name shown on portfolio</label>
        <div className="row">
          <input id="dn" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn secondary" disabled={busy || !name.trim() || name === displayName} onClick={() => patch({ displayName: name.trim() })}>Save</button>
        </div>
      </div>
      <div className="row">
        <button className={`btn ${isPublic ? "secondary" : ""}`} disabled={busy} onClick={() => patch({ isPublic: !isPublic })}>
          {isPublic ? "Make private" : "Publish portfolio"}
        </button>
        {isPublic && (
          <>
            <a href={`/p/${slug}`} target="_blank" rel="noreferrer">View public page</a>
            <button
              className="btn secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
