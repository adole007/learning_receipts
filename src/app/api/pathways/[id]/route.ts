import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { handle } from "@/lib/api";
import { requireOwnedPathway } from "@/lib/learner";

const body = z.object({
  isPublic: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const p = await requireOwnedPathway(id);
  const input = body.parse(await req.json());
  const db = getDb();
  if (input.isPublic !== undefined) await db.update(schema.pathways).set({ isPublic: input.isPublic }).where(eq(schema.pathways.id, id));
  if (input.displayName) await db.update(schema.learners).set({ displayName: input.displayName }).where(eq(schema.learners.id, p.learnerId));
  return { ok: true };
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireOwnedPathway(id);
  await getDb().delete(schema.pathways).where(eq(schema.pathways.id, id));
  return { ok: true };
});
