export function StatusPill({ status }: { status: string }) {
  const cls = status === "READY" ? "ok" : status === "FAILED" ? "bad" : "warn";
  const text = { PENDING: "Queued", INGESTING: "Reading sources", STRUCTURING: "Structuring", READY: "Ready", FAILED: "Failed" }[status] ?? status;
  return <span className={`pill ${cls}`}>{text}</span>;
}

export function VerificationPill({ v }: { v: string }) {
  if (v === "VERIFIED") return <span className="pill ok" title="Quote located in source and answer independently judged as supported">✓ Evidence-verified</span>;
  if (v === "QUOTE_ONLY") return <span className="pill warn" title="Quote located in source; entailment check was unavailable">Quote-verified</span>;
  return <span className="pill bad">Rejected</span>;
}

export function Bar({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className={`bar ${value === null ? "na" : ""}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      <i style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  );
}

export const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function Sparkline({ series, width = 160, height = 36 }: { series: number[]; width?: number; height?: number }) {
  if (series.length < 2) return <span className="small muted">Answer 10+ questions to see a trend</span>;
  const step = width / (series.length - 1);
  const pts = series.map((y, i) => `${(i * step).toFixed(1)},${(height - 3 - y * (height - 6)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Accuracy per block of 5 answers">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const KIND_ICON: Record<string, string> = { YOUTUBE: "▶", PDF: "▤", ARTICLE: "¶" };
export function EvidenceChip({ href, label, title, kind }: { href: string; label: string; title?: string | null; kind?: string }) {
  return (
    <a className="chip" href={href} target="_blank" rel="noreferrer" title={title ?? undefined}>
      {kind ? `${KIND_ICON[kind] ?? ""} ` : ""}
      {label}
    </a>
  );
}
