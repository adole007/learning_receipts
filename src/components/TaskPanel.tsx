"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Feedback = { criterion: string; met: boolean; comment: string; chunkIds: string[] };
type ChunkLink = { label: string; deepLink: string };

export function NewTaskButton({ moduleId, hasTasks }: { moduleId: string; hasTasks: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row">
      <button
        className={`btn ${hasTasks ? "secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch(`/api/modules/${moduleId}/tasks`, { method: "POST" });
          if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Failed");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy && <span className="spinner" />} {busy ? "Designing task…" : hasTasks ? "New task" : "Generate an applied task"}
      </button>
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
    </span>
  );
}

export function TaskSubmit({ taskId, chunkLinks }: { taskId: string; chunkLinks: Record<string, ChunkLink> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; feedback: Feedback[] } | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/tasks/${taskId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response: text }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Failed");
    setResult(d);
    router.refresh();
  }

  if (result) return <FeedbackList score={result.score} feedback={result.feedback} chunkLinks={chunkLinks} />;
  return (
    <div className="stack">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your response (150–400 words works well)…" style={{ minHeight: 180 }} />
      {err && <div className="error">{err}</div>}
      <div className="row">
        <button className="btn" disabled={busy || text.trim().length < 40} onClick={submit}>
          {busy && <span className="spinner" />} {busy ? "Grading against your sources…" : "Submit for grading"}
        </button>
        <span className="small muted">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </div>
  );
}

export function FeedbackList({ score, feedback, chunkLinks }: { score: number; feedback: Feedback[]; chunkLinks: Record<string, ChunkLink> }) {
  return (
    <div className="stack">
      <div className="spread">
        <strong>Rubric score: {Math.round(score * 100)}%</strong>
        <span className="small muted">{feedback.filter((f) => f.met).length} / {feedback.length} criteria met</span>
      </div>
      <table className="list">
        <tbody>
          {feedback.map((f, i) => (
            <tr key={i}>
              <td style={{ width: 70 }}>
                <span className={`pill ${f.met ? "ok" : "bad"}`}>{f.met ? "Met" : "Not yet"}</span>
              </td>
              <td>
                <strong className="small">{f.criterion}</strong>
                <div className="small">{f.comment}</div>
                <div className="chips">
                  {f.chunkIds.map((id) =>
                    chunkLinks[id] ? (
                      <a key={id} className="chip" href={chunkLinks[id].deepLink} target="_blank" rel="noreferrer">{chunkLinks[id].label}</a>
                    ) : null,
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
