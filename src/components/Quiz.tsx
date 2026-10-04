"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VerificationPill } from "./bits";

type Q = { id: string; stem: string; options: string[]; difficulty: number; objective: string; verification: string };
type Result = {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  receipt: { seq: number; hash: string };
  evidence: { quote: string; label: string; deepLink: string; sourceTitle: string; kind: string }[];
};

const CONF = [
  { v: 1, label: "Guessing" },
  { v: 2, label: "Fairly sure" },
  { v: 3, label: "Certain" },
];

export function Quiz({ pathwayId, moduleId, mode }: { pathwayId: string; moduleId?: string; mode: "practice" | "review" }) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(2);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });

  useEffect(() => {
    const qs = new URLSearchParams({ mode });
    if (moduleId) qs.set("moduleId", moduleId);
    fetch(`/api/pathways/${pathwayId}/quiz?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setQuestions(d.questions);
      })
      .catch((e) => setError((e as Error).message));
  }, [pathwayId, moduleId, mode]);

  if (error) return <div className="error">{error}</div>;
  if (!questions) return <div className="row"><span className="spinner" /> Loading questions…</div>;
  if (!questions.length)
    return (
      <div className="card stack">
        <p style={{ margin: 0 }}>
          {mode === "review" ? "Nothing is due for revision right now. Come back later — items return on a spaced schedule." : "No verified questions yet for this selection."}
        </p>
        <Link href={`/pathways/${pathwayId}`}>← Back to pathway</Link>
      </div>
    );

  if (i >= questions.length) {
    return (
      <div className="receipt stack">
        <div className="line"><strong>SESSION COMPLETE</strong><span>{mode.toUpperCase()}</span></div>
        <hr />
        <div className="line"><span>Correct</span><span>{score.right} / {score.total}</span></div>
        <div className="line"><span>Accuracy</span><span>{Math.round((score.right / Math.max(score.total, 1)) * 100)}%</span></div>
        <hr />
        <div>Every answer above was added to your receipt chain.</div>
        <div className="row" style={{ fontFamily: "var(--sans)" }}>
          <Link className="btn" href={`/pathways/${pathwayId}`}>See updated readiness</Link>
        </div>
      </div>
    );
  }

  const q = questions[i];

  async function check() {
    if (selected === null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: q.id, selectedIndex: selected, confidence, isReview: mode === "review" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResult(d);
      setScore((s) => ({ right: s.right + (d.correct ? 1 : 0), total: s.total + 1 }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setI((n) => n + 1);
    setSelected(null);
    setResult(null);
    setConfidence(2);
  }

  return (
    <div className="stack">
      <div className="spread small muted">
        <span className="mono">Question {i + 1} / {questions.length} · {"●".repeat(q.difficulty)}{"○".repeat(3 - q.difficulty)}</span>
        <VerificationPill v={q.verification} />
      </div>
      <div className="card">
        <div className="eyebrow">Objective</div>
        <p className="small" style={{ marginTop: -4 }}>{q.objective}</p>
        <h3 style={{ fontSize: "1.2rem" }}>{q.stem}</h3>
        <div role="radiogroup" aria-label="Answer options">
          {q.options.map((o, k) => {
            let cls = "option";
            if (result) {
              if (k === result.correctIndex) cls += " correct";
              else if (k === selected) cls += " wrong";
            } else if (k === selected) cls += " selected";
            return (
              <button key={k} role="radio" aria-checked={k === selected} className={cls} disabled={!!result} onClick={() => setSelected(k)}>
                <span className="key">{String.fromCharCode(65 + k)}</span>
                {o}
              </button>
            );
          })}
        </div>

        {!result && (
          <div className="stack" style={{ marginTop: 18 }}>
            <div className="row small">
              <span className="muted">Confidence:</span>
              {CONF.map((c) => (
                <button key={c.v} className={`btn ${confidence === c.v ? "" : "secondary"}`} style={{ padding: "5px 10px" }} onClick={() => setConfidence(c.v)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div>
              <button className="btn" disabled={selected === null || busy} onClick={check}>
                {busy && <span className="spinner" />} Check answer
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="stack" style={{ marginTop: 18 }}>
            <div className={`pill ${result.correct ? "ok" : "bad"}`} style={{ alignSelf: "start" }}>{result.correct ? "Correct" : "Not quite"}</div>
            <p style={{ margin: 0 }}>{result.explanation}</p>
            <div>
              <div className="eyebrow">Evidence from your sources</div>
              {result.evidence.map((e, k) => (
                <blockquote className="evidence" key={k}>
                  “{e.quote}”
                  <footer>
                    <a href={e.deepLink} target="_blank" rel="noreferrer">{e.sourceTitle} · {e.label} ↗</a>
                  </footer>
                </blockquote>
              ))}
            </div>
            <div className="spread">
              <span className="small mono muted" title={result.receipt.hash}>receipt #{result.receipt.seq} · {result.receipt.hash.slice(0, 12)}…</span>
              <button className="btn" onClick={next}>{i + 1 < questions.length ? "Next question" : "Finish"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
