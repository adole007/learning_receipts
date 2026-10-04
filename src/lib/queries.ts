import { asc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeMastery, type AttemptLite } from "@/engine/mastery";

const chunkRef = {
  columns: { id: true, label: true, deepLink: true, locatorType: true },
  with: { source: { columns: { id: true, title: true, url: true, kind: true } } },
} as const;

export async function loadPathwayGraph(pathwayId: string) {
  const db = getDb();
  const pathway = await db.query.pathways.findFirst({
    where: eq(schema.pathways.id, pathwayId),
    with: {
      learner: { columns: { displayName: true } },
      sources: { orderBy: asc(schema.sources.createdAt) },
      modules: {
        orderBy: asc(schema.modules.ordinal),
        with: {
          objectives: {
            orderBy: asc(schema.objectives.ordinal),
            with: {
              evidence: { with: { chunk: chunkRef } },
              questions: {
                where: ne(schema.questions.verification, "REJECTED"),
                with: {
                  attempts: { orderBy: asc(schema.attempts.createdAt) },
                  evidence: { with: { chunk: chunkRef } },
                  schedule: true,
                },
              },
            },
          },
          tasks: { with: { submissions: { orderBy: asc(schema.taskSubmissions.createdAt) } } },
        },
      },
    },
  });
  if (!pathway) return null;

  const verificationRows = await db
    .select({
      moduleId: schema.objectives.moduleId,
      verification: schema.questions.verification,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.questions)
    .innerJoin(schema.objectives, eq(schema.questions.objectiveId, schema.objectives.id))
    .innerJoin(schema.modules, eq(schema.objectives.moduleId, schema.modules.id))
    .where(eq(schema.modules.pathwayId, pathwayId))
    .groupBy(schema.objectives.moduleId, schema.questions.verification);

  const verificationByModule: Record<string, { VERIFIED: number; QUOTE_ONLY: number; REJECTED: number }> = {};
  for (const r of verificationRows) {
    verificationByModule[r.moduleId] ??= { VERIFIED: 0, QUOTE_ONLY: 0, REJECTED: 0 };
    verificationByModule[r.moduleId][r.verification] = r.n;
  }

  const objectiveIds = pathway.modules.flatMap((m) => m.objectives.map((o) => o.id));
  const attempts: AttemptLite[] = pathway.modules.flatMap((m) =>
    m.objectives.flatMap((o) =>
      o.questions.flatMap((q) =>
        q.attempts.map((a) => ({ questionId: q.id, objectiveId: o.id, correct: a.correct, isReview: a.isReview, createdAt: a.createdAt })),
      ),
    ),
  );
  const taskScores = pathway.modules
    .flatMap((m) => m.tasks)
    .filter((t) => t.submissions.length)
    .map((t) => Math.max(...t.submissions.map((s) => s.score)));

  const mastery = computeMastery({ objectiveIds, attempts, taskScores });
  return { pathway, mastery, verificationByModule };
}

export type PathwayGraph = NonNullable<Awaited<ReturnType<typeof loadPathwayGraph>>>;
