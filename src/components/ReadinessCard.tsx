import type { MasteryReport } from "@/engine/mastery";
import { Bar, pct, Sparkline } from "./bits";

export function ReadinessCard({ m }: { m: MasteryReport }) {
  return (
    <div className="card stack">
      <div className="eyebrow">Readiness score</div>
      <div className="spread">
        <div className="score">
          {m.readiness}
          <small>/100</small>
        </div>
        <span className={`pill ${m.band === "Ready" || m.band === "Competent" ? "ok" : m.band === "Developing" ? "warn" : ""}`}>{m.band}</span>
      </div>
      {m.components.map((c) => (
        <div key={c.key} className="metric" title={c.explain}>
          <span className="small">
            {c.label} <span className="muted">· weight {Math.round(c.weight * 100)}%</span>
          </span>
          <span className="mono small">{pct(c.value)}</span>
          <Bar value={c.value} label={c.label} />
        </div>
      ))}
      <div className="spread small">
        <span>
          Quiz trend: <strong>{m.trend.label}</strong>
          {m.accuracyRecent !== null && <span className="muted"> · last 10: {pct(m.accuracyRecent)}</span>}
        </span>
        <Sparkline series={m.trend.series} />
      </div>
      <div className="small muted">
        Evidence sufficiency {pct(m.evidenceSufficiency)} — the score is discounted until there are ~2 answers per objective.
        {m.caps.map((c) => (
          <div key={c}>⚑ {c}</div>
        ))}
      </div>
    </div>
  );
}
