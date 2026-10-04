import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { handle } from "@/lib/api";
import { requireOwnedPathway } from "@/lib/learner";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const p = await requireOwnedPathway(id);
  const db = getDb();
  const [sources, modules] = await Promise.all([
    db.query.sources.findMany({ where: eq(schema.sources.pathwayId, id), columns: { url: true, title: true, status: true, error: true } }),
    db.query.modules.findMany({ where: eq(schema.modules.pathwayId, id), orderBy: asc(schema.modules.ordinal), columns: { id: true, questionsGeneratedAt: true } }),
  ]);
  return {
    status: p.status,
    detail: p.statusDetail,
    sources,
    modulesReady: modules.filter((m) => m.questionsGeneratedAt).length,
    modulesTotal: modules.length,
  };
});
