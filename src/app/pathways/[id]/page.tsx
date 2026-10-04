import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceChip, StatusPill, Bar, pct } from "@/components/bits";
import { ReadinessCard } from "@/components/ReadinessCard";
import { ShareToggle } from "@/components/ShareToggle";
import { StatusPoller } from "@/components/StatusPoller";
import { GenerateButton } from "@/components/GenerateButton";
import { requireOwnedPathway } from "@/lib/learner";
import { loadPathwayGraph } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PathwayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireOwnedPathway(id);
  } catch {
    notFound();
  }
  const graph = await loadPathwayGraph(id);
  if (!graph) notFound();
  const { pathway: p, mastery, verificationByModule } = graph;

  const header = (
    <div className="stack" style={{ marginBottom: 24 }}>
      <div className="row">
        <Link href="/" className="small muted">← All pathways</Link>
        <StatusPill status={p.status} />
      </div>
      <h1>{p.title}</h1>
      {p.goal && <p className="lede">Goal: {p.goal}</p>}
    </div>
  );

  if (p.status !== "READY") {
    return (
      <>
        {header}
        {p.status === "FAILED" ? (
          <div className="error">
            <strong>Processing failed.</strong> {p.statusDetail}
          </div>
        ) : (
          <StatusPoller pathwayId={p.id} initialStatus={p.status} />
        )}
      </>
    );
  }

  const now = Date.now();
  const allQuestions = p.modules.flatMap((m) => m.objectives.flatMap((o) => o.questions));
  const due = allQuestions.filter((q) => q.attempts.length && q.schedule && q.schedule.dueAt.getTime() <= now).length;
  const seen = allQuestions.filter((q) => q.attempts.length).length;
  const answered = allQuestions.reduce((n, q) => n + q.attempts.length, 0);

  return (
    <>
      {header}
      <StatusPoller pathwayId={p.id} initialStatus={p.status} compact />
      <div className="grid grid-2" style={{ marginTop: 16, alignItems: "start" }}>
        <ReadinessCard m={mastery} />
        <div className="card stack">
          <div className="eyebrow">Practise</div>
          <p style={{ margin: 0 }}>
            {allQuestions.length} verified questions · {answered} answers recorded
          </p>
          <div className="row">
            <Link className="btn" href={`/pathways/${p.id}/practice`}>Practise all modules</Link>
            <Link className="btn secondary" href={`/pathways/${p.id}/practice?mode=review`}>Spaced revision ({due} due)</Link>
          </div>
          {seen === 0 && <p className="small muted" style={{ margin: 0 }}>Revision unlocks after you answer questions — items come back on an SM-2 schedule.</p>}
          <hr style={{ border: 0, borderTop: "1px solid var(--rule)", width: "100%" }} />
          <div className="eyebrow">Portfolio</div>
          <ShareToggle pathwayId={p.id} isPublic={p.isPublic} slug={p.publicSlug} displayName={p.learner.displayName} />
        </div>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Modules</h2>
        {p.modules.map((m, i) => {
          const v = verificationByModule[m.id];
          const served = m.objectives.reduce((n, o) => n + o.questions.length, 0);
          return (
            <div className="module" key={m.id}>
              <div className="spread">
                <h3>
                  <span className="mono muted">{String(i + 1).padStart(2, "0")}</span> {m.title}
                </h3>
                <div className="row">
                  {m.questionsGeneratedAt ? (
                    <>
                      <Link className="btn secondary" href={`/pathways/${p.id}/practice?moduleId=${m.id}`}>Quiz ({served})</Link>
                      <Link className="btn secondary" href={`/pathways/${p.id}/modules/${m.id}`}>Applied task</Link>
                    </>
                  ) : (
                    <GenerateButton moduleId={m.id} />
                  )}
                </div>
              </div>
              <p className="small muted" style={{ marginBottom: 6 }}>{m.summary}</p>
              {v && (
                <p className="small mono muted" style={{ margin: 0 }} title="Questions that fail verification are never shown">
                  Verification: {v.VERIFIED} verified · {v.QUOTE_ONLY} quote-only · {v.REJECTED} rejected
                </p>
              )}
              <ul className="objectives">
                {m.objectives.map((o) => {
                  const om = mastery.perObjective[o.id];
                  return (
                    <li key={o.id}>
                      <div>
                        {o.statement}
                        <div className="chips">
                          {o.evidence.map((e) => (
                            <EvidenceChip key={e.chunkId} href={e.chunk.deepLink} label={e.chunk.label} title={e.chunk.source.title} kind={e.chunk.source.kind} />
                          ))}
                        </div>
                      </div>
                      <div title={`${om?.attempts ?? 0} answers`}>
                        <div className="mono small" style={{ textAlign: "right" }}>{om?.attempts ? pct(om.mastery) : "—"}</div>
                        <Bar value={om?.attempts ? om.mastery : null} label="Objective mastery" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Sources</h2>
        <table className="list">
          <tbody>
            {p.sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.title ?? s.url}</a>
                  {s.error && <div className="small" style={{ color: "var(--bad)" }}>{s.error}</div>}
                  {s.contentHash && <div className="small mono muted" title="SHA-256 of the extracted text at ingestion time">sha256 {s.contentHash.slice(0, 16)}…</div>}
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className={`pill ${s.status === "OK" ? "ok" : s.status === "FAILED" ? "bad" : ""}`}>{s.kind}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
