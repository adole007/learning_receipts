import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateQuestionsForModule } from "@/engine/generate";
import { handle } from "@/lib/api";
import { requireOwnedPathway, HttpError } from "@/lib/learner";

export const maxDuration = 300;

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const mod = await getDb().query.modules.findFirst({ where: eq(schema.modules.id, id) });
  if (!mod) throw new HttpError(404, "Module not found");
  await requireOwnedPathway(mod.pathwayId);
  return generateQuestionsForModule(id);
});
