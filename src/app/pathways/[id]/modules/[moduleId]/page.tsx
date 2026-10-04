import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { FeedbackList, NewTaskButton, TaskSubmit } from "@/components/TaskPanel";
import { requireOwnedPathway } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function ModuleTaskPage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id, moduleId } = await params;
  try {
    await requireOwnedPathway(id);
  } catch {
    notFound();
  }
  const db = getDb();
  const mod = await db.query.modules.findFirst({
    where: and(eq(schema.modules.id, moduleId), eq(schema.modules.pathwayId, id)),
    with: {
      objectives: { orderBy: asc(schema.objectives.ordinal) },
      tasks: { orderBy: asc(schema.appliedTasks.createdAt), with: { submissions: { orderBy: asc(schema.taskSubmissions.createdAt) } } },
    },
  });
  if (!mod) notFound();

  const chunkIds = Array.from(new Set(mod.tasks.flatMap((t) => t.rubric.flatMap((r) => r.chunkIds))));
  const chunks = chunkIds.length
    ? await db.query.sourceChunks.findMany({ where: inArray(schema.sourceChunks.id, chunkIds), columns: { id: true, label: true, deepLink: true } })
    : [];
  const chunkLinks = Object.fromEntries(chunks.map((c) => [c.id, { label: c.label, deepLink: c.deepLink }]));

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link href={`/pathways/${id}`} className="small muted">← Back to pathway</Link>
      <div className="eyebrow">Applied task</div>
      <h1>{mod.title}</h1>
      <p className="lede">Apply what you learned. Each rubric criterion is anchored to a passage in your sources, and grading only credits what those sources support.</p>

      {mod.tasks.map((t, i) => {
        const last = t.submissions.at(-1);
        return (
          <section key={t.id} className="card stack">
            <div className="eyebrow">Task {i + 1}</div>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{t.prompt}</p>
            <details>
              <summary className="small">Rubric ({t.rubric.length} criteria)</summary>
              <ul className="small">
                {t.rubric.map((r, k) => (
                  <li key={k}>
                    {r.criterion}{" "}
                    {r.chunkIds.map((cid) => chunkLinks[cid] && (
                      <a key={cid} className="chip" href={chunkLinks[cid].deepLink} target="_blank" rel="noreferrer">{chunkLinks[cid].label}</a>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
            {last && (
              <>
                <div className="small muted">Your latest submission ({t.submissions.length} total)</div>
                <FeedbackList score={last.score} feedback={last.feedback} chunkLinks={chunkLinks} />
              </>
            )}
            <TaskSubmit taskId={t.id} chunkLinks={chunkLinks} />
          </section>
        );
      })}

      <NewTaskButton moduleId={mod.id} hasTasks={mod.tasks.length > 0} />
    </div>
  );
}
