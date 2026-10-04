import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { appendReceipt } from "@/engine/ledger";
import { gradeSubmission } from "@/engine/tasks";
import { handle } from "@/lib/api";
import { requireOwnedPathway, HttpError } from "@/lib/learner";

export const maxDuration = 120;
const body = z.object({ response: z.string().trim().min(40).max(8000) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { response } = body.parse(await req.json());
  const db = getDb();
  const task = await db.query.appliedTasks.findFirst({ where: eq(schema.appliedTasks.id, id), with: { module: true } });
  if (!task) throw new HttpError(404, "Task not found");
  await requireOwnedPathway(task.module.pathwayId);

  const { feedback, score } = await gradeSubmission(id, response);
  const now = new Date();
  const receipt = await db.transaction(async (tx) => {
    const [sub] = await tx.insert(schema.taskSubmissions).values({ taskId: id, response, score, feedback, createdAt: now }).returning({ id: schema.taskSubmissions.id });
    return appendReceipt(tx, task.module.pathwayId, "TASK_SUBMISSION", sub.id, { taskId: id, task: task.prompt, response, score, feedback }, now);
  });
  return { score, feedback, receipt };
});
