import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { handle } from "@/lib/api";
import { requireOwnedPathway } from "@/lib/learner";

/** Questions for practice (one module) or revision (all due items). Answers are never sent to the client here. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireOwnedPathway(id);
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "review" ? "review" : "practice";
  const moduleId = url.searchParams.get("moduleId");
  const db = getDb();

  const mods = await db.query.modules.findMany({
    where: moduleId ? and(eq(schema.modules.pathwayId, id), eq(schema.modules.id, moduleId)) : eq(schema.modules.pathwayId, id),
    with: { objectives: { columns: { id: true, statement: true } } },
  });
  const objectiveIds = mods.flatMap((m) => m.objectives.map((o) => o.id));
  if (!objectiveIds.length) return { mode, questions: [] };
  const objText = new Map(mods.flatMap((m) => m.objectives.map((o) => [o.id, o.statement] as const)));

  const qs = await db.query.questions.findMany({
    where: and(inArray(schema.questions.objectiveId, objectiveIds), ne(schema.questions.verification, "REJECTED")),
    with: { schedule: true, attempts: { columns: { correct: true } } },
  });

  const now = new Date();
  let picked = qs;
  if (mode === "review") {
    picked = qs.filter((q) => q.attempts.length > 0 && q.schedule && q.schedule.dueAt <= now);
    picked.sort((a, b) => a.schedule!.dueAt.getTime() - b.schedule!.dueAt.getTime());
    picked = picked.slice(0, 15);
  } else {
    // unseen first, then previously missed, then the rest; easier first within each group
    const rank = (q: (typeof qs)[number]) => (q.attempts.length === 0 ? 0 : q.attempts.some((a) => !a.correct) ? 1 : 2);
    picked = [...qs].sort((a, b) => rank(a) - rank(b) || a.difficulty - b.difficulty).slice(0, 12);
  }
  return {
    mode,
    questions: picked.map((q) => ({
      id: q.id,
      stem: q.stem,
      options: q.options,
      difficulty: q.difficulty,
      objective: objText.get(q.objectiveId) ?? "",
      verification: q.verification,
    })),
  };
});
