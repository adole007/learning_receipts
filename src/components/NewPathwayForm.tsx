"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewPathwayForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = links
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parsed.length) return setError("Add at least one link starting with http(s)://");
    setBusy(true);
    try {
      const res = await fetch("/api/pathways", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, goal: goal || undefined, links: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create pathway");
      router.push(`/pathways/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <label htmlFor="title">What are you learning?</label>
        <input id="title" type="text" required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Intro to SQL for data analysis" />
      </div>
      <div>
        <label htmlFor="goal">Goal (optional)</label>
        <input id="goal" type="text" maxLength={500} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Pass a junior data analyst technical screen" />
      </div>
      <div>
        <label htmlFor="links">Your links</label>
        <textarea id="links" value={links} onChange={(e) => setLinks(e.target.value)} placeholder={"https://www.youtube.com/watch?v=...\nhttps://example.org/guide.pdf\nhttps://blog.example.com/article"} />
        <div className="hint">
          One per line. YouTube videos (with captions), PDFs and articles. {parsed.length > 0 && <strong>{parsed.length} link{parsed.length > 1 ? "s" : ""} detected.</strong>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {busy ? "Creating…" : "Build my pathway"}
        </button>
        <span className="small muted">Takes 1–3 minutes depending on how much material you add.</span>
      </div>
    </form>
  );
}
