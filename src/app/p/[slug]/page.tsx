import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { Bar, pct } from "@/components/bits";
import { ReadinessCard } from "@/components/ReadinessCard";
import { verifyChain } from "@/engine/receipts";
import { loadPathwayGraph } from "@/lib/queries";

export const dynamic = "force-dynamic";

type AttemptPayload = {
  objective: string;
  stem: string;
  selected: string;
  correctAnswer: string;
  correct: boolean;
  isReview: boolean;
  evidence: { quote: string; source: string | null; at: string; link: string }[];
};
type TaskPayload = { task: string; score: number; feedback: { criterion: string; met: boolean }[] };

async function load(slug: string) {
  const db = getDb();
  const p = await db.query.pathways.findFirst({ where: and(eq(schema.pathways.publicSlug, slug), eq(schema.pathways.isPublic, true)) });
  if (!p) return null;
  const [graph, chain] = await Promise.all([
    loadPathwayGraph(p.id),
    db.query.receipts.findMany({ where: eq(schema.receipts.pathwayId, p.id), orderBy: asc(schema.receipts.seq) }),
  ]);
  if (!graph) return null;
  const check = verifyChain(
    p.id,
    chain.map((r) => ({ seq: r.seq, kind: r.kind, refId: r.refId, payload: r.payload, prevHash: r.prevHash, createdAt: r.createdAt.toISOString(), hash: r.hash })),
  );
  return { graph, chain, check };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: "Portfolio not found" };
  return { title: `${d.graph.pathway.learner.displayName} — ${d.graph.pathway.title} · Receipts for Learning`, robots: { index: false } };
}

export default async function PortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { graph, chain, check } = d;
  const { pathway: p, mastery } = graph;
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

  return (
    <div className="stack" style={{ gap: 28 }}>
      <header className="stack">
        <div className="eyebrow">Verified learning portfolio</div>
        <h1>{p.title}</h1>
        <p className="lede">
          {p.learner.displayName} · {chain.length} recorded learning events from {p.sources.filter((s) => s.status === "OK").length} self-chosen sources
        </p>
        <div className="row">
          {check.valid ? (
            <span className="pill ok" title={`Chain head ${check.head}`}>✓ Receipt chain intact · {check.length} receipts</span>
          ) : (
            <span className="pill bad">⚠ Chain broken at receipt #{check.brokenAt} ({check.reason})</span>
          )}
          <a className="small" href={`/api/portfolio/${slug}`}>Export JSON for independent verification</a>
        </div>
      </header>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <ReadinessCard m={mastery} />
        <div className="card stack">
          <div className="eyebrow">Objectives demonstrated</div>
          {p.modules.map((m) => (
            <div key={m.id}>
              <strong className="small">{m.title}</strong>
              <ul className="objectives">
                {m.objectives.map((o) => {
                  const om = mastery.perObjective[o.id];
                  return (
                    <li key={o.id}>
                      <span className="small">{o.statement}</span>
                      <div>
                        <div className="mono small" style={{ textAlign: "right" }}>{om?.attempts ? pct(om.mastery) : "—"}</div>
                        <Bar value={om?.attempts ? om.mastery : null} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <section className="card">
        <h2>Sources</h2>
        <table className="list">
          <tbody>
            {p.sources.filter((s) => s.status === "OK").map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.title ?? s.url}</a>
                  <div className="small mono muted">{s.kind} · sha256 {s.contentHash?.slice(0, 16)}…</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="stack">
        <h2>Receipts</h2>
        <p className="small muted" style={{ marginTop: -8 }}>Most recent first. Each answer links to the exact evidence it was assessed against.</p>
        {[...chain].reverse().slice(0, 60).map((r) => {
          if (r.kind === "ATTEMPT") {
            const a = r.payload as unknown as AttemptPayload;
            return (
              <div className="receipt" key={r.id}>
                <div className="line"><span>#{String(r.seq).padStart(4, "0")} {a.isReview ? "REVISION" : "QUIZ"}</span><span>{fmt.format(r.createdAt)}</span></div>
                <hr />
                <div className="muted">{a.objective}</div>
                <div style={{ margin: "6px 0" }}>{a.stem}</div>
                <div className="line"><span>Answered</span><span style={{ textAlign: "right" }}>{a.selected}</span></div>
                <div className="line"><span>Result</span><strong style={{ color: a.correct ? "var(--accent)" : "var(--bad)" }}>{a.correct ? "CORRECT" : "INCORRECT"}</strong></div>
                {a.evidence?.map((e, k) => (
                  <div key={k} className="small" style={{ marginTop: 6 }}>
                    ↳ <a href={e.link} target="_blank" rel="noreferrer">{e.source} · {e.at}</a>
                  </div>
                ))}
                <hr />
                <div className="small muted" title={r.hash}>hash {r.hash.slice(0, 24)}… ← prev {r.prevHash.slice(0, 8)}…</div>
              </div>
            );
          }
          const t = r.payload as unknown as TaskPayload;
          return (
            <div className="receipt" key={r.id}>
              <div className="line"><span>#{String(r.seq).padStart(4, "0")} APPLIED TASK</span><span>{fmt.format(r.createdAt)}</span></div>
              <hr />
              <div style={{ whiteSpace: "pre-wrap" }}>{t.task.slice(0, 280)}{t.task.length > 280 ? "…" : ""}</div>
              <div className="line" style={{ marginTop: 6 }}><span>Rubric score</span><strong>{Math.round(t.score * 100)}%</strong></div>
              {t.feedback.map((f, k) => (
                <div key={k} className="small">{f.met ? "✓" : "✗"} {f.criterion}</div>
              ))}
              <hr />
              <div className="small muted" title={r.hash}>hash {r.hash.slice(0, 24)}… ← prev {r.prevHash.slice(0, 8)}…</div>
            </div>
          );
        })}
        {chain.length === 0 && <p className="muted">No learning events recorded yet.</p>}
      </section>
    </div>
  );
}
