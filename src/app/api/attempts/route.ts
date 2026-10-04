import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { appendReceipt } from "@/engine/ledger";
import { nextReview, qualityFrom } from "@/engine/srs";
import { handle } from "@/lib/api";
import { getLearnerId, HttpError } from "@/lib/learner";

const body = z.object({
  questionId: z.string(),
  selectedIndex: z.number().int().min(0),
  confidence: z.number().int().min(1).max(3).optional(),
  isReview: z.boolean().default(false),
});

export const POST = handle(async (req: Request) => {
  const learnerId = await getLearnerId();
  const input = body.parse(await req.json());
  const db = getDb();

  const q = await db.query.questions.findFirst({
    where: eq(schema.questions.id, input.questionId),
    with: {
      schedule: true,
      objective: { with: { module: { with: { pathway: { columns: { id: true, learnerId: true } } } } } },
      evidence: {
        with: { chunk: { columns: { id: true, label: true, deepLink: true }, with: { source: { columns: { title: true, url: true, kind: true } } } } },
      },
    },
  });
  if (!q || q.objective.module.pathway.learnerId !== learnerId) throw new HttpError(404, "Question not found");
  if (q.verification === "REJECTED") throw new HttpError(400, "Question is not available");
  if (input.selectedIndex >= q.options.length) throw new HttpError(400, "Invalid option");

  const pathwayId = q.objective.module.pathway.id;
  const correct = input.selectedIndex === q.correctIndex;
  const now = new Date();

  const receipt = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(schema.attempts)
      .values({ questionId: q.id, selectedIndex: input.selectedIndex, correct, isReview: input.isReview, confidence: input.confidence, createdAt: now })
      .returning({ id: schema.attempts.id });

    const s = q.schedule ?? { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
    const next = nextReview(s, qualityFrom(correct, input.confidence), now);
    await tx
      .insert(schema.reviewSchedules)
      .values({ questionId: q.id, ...next })
      .onConflictDoUpdate({ target: schema.reviewSchedules.questionId, set: next });

    return appendReceipt(
      tx,
      pathwayId,
      "ATTEMPT",
      attempt.id,
      {
        questionId: q.id,
        objective: q.objective.statement,
        stem: q.stem,
        selected: q.options[input.selectedIndex],
        correctAnswer: q.options[q.correctIndex],
        correct,
        isReview: input.isReview,
        verification: q.verification,
        evidence: q.evidence.map((e) => ({ quote: e.quote, source: e.chunk.source.title, at: e.chunk.label, link: e.chunk.deepLink })),
      },
      now,
    );
  });

  return {
    correct,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    receipt,
    evidence: q.evidence.map((e) => ({
      quote: e.quote,
      label: e.chunk.label,
      deepLink: e.chunk.deepLink,
      sourceTitle: e.chunk.source.title ?? e.chunk.source.url,
      kind: e.chunk.source.kind,
    })),
  };
});
