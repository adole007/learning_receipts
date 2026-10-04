/** End-to-end processing of a new pathway: ingest → structure → generate. */
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateQuestionsForModule } from "./generate";
import { ingestUrl } from "./ingest";
import { sha256 } from "./receipts";
import { structurePathway, type StructChunk } from "./structure";

async function setStatus(pathwayId: string, status: (typeof schema.pathwayStatus.enumValues)[number], detail?: string) {
  await getDb()
    .update(schema.pathways)
    .set({ status, statusDetail: detail ?? null, updatedAt: new Date() })
    .where(eq(schema.pathways.id, pathwayId));
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

export async function processPathway(pathwayId: string) {
  const db = getDb();
  try {
    const pathway = await db.query.pathways.findFirst({ where: eq(schema.pathways.id, pathwayId), with: { sources: true } });
    if (!pathway) return;

    // 1) Ingest
    await setStatus(pathwayId, "INGESTING", `Reading ${pathway.sources.length} source(s)`);
    await mapLimit(pathway.sources, 3, async (src) => {
      try {
        const res = await ingestUrl(src.url);
        await db.transaction(async (tx) => {
          await tx.insert(schema.sourceChunks).values(res.chunks.map((c) => ({ ...c, sourceId: src.id })));
          await tx
            .update(schema.sources)
            .set({ status: "OK", kind: res.kind, title: res.title, contentHash: sha256(res.chunks.map((c) => c.text).join("\n")) })
            .where(eq(schema.sources.id, src.id));
        });
      } catch (e) {
        await db.update(schema.sources).set({ status: "FAILED", error: (e as Error).message.slice(0, 500) }).where(eq(schema.sources.id, src.id));
      }
    });

    const okSources = await db.query.sources.findMany({
      where: eq(schema.sources.pathwayId, pathwayId),
      with: { chunks: { orderBy: asc(schema.sourceChunks.ordinal) } },
    });
    const chunks: StructChunk[] = okSources
      .filter((s) => s.status === "OK")
      .flatMap((s) => s.chunks.map((c) => ({ id: c.id, sourceTitle: s.title ?? s.url, label: c.label, text: c.text })));
    if (!chunks.length) throw new Error("None of the links could be read. Check they are public, or that videos have captions.");

    // 2) Structure
    await setStatus(pathwayId, "STRUCTURING", `Organising ${chunks.length} evidence chunks into modules`);
    const structure = await structurePathway({ title: pathway.title, goal: pathway.goal, chunks });
    const moduleIds: string[] = [];
    await db.transaction(async (tx) => {
      for (const [mi, m] of structure.modules.entries()) {
        const [mod] = await tx
          .insert(schema.modules)
          .values({ pathwayId, ordinal: mi, title: m.title, summary: m.summary })
          .returning({ id: schema.modules.id });
        moduleIds.push(mod.id);
        for (const [oi, o] of m.objectives.entries()) {
          const [obj] = await tx
            .insert(schema.objectives)
            .values({ moduleId: mod.id, ordinal: oi, statement: o.statement, bloom: o.bloom })
            .returning({ id: schema.objectives.id });
          await tx.insert(schema.objectiveEvidence).values(o.chunkIds.map((chunkId) => ({ objectiveId: obj.id, chunkId })));
        }
      }
    });
    await setStatus(pathwayId, "READY", "Generating verified assessments");

    // 3) Generate assessments (pathway is usable while this runs)
    for (const [i, id] of moduleIds.entries()) {
      try {
        await generateQuestionsForModule(id);
      } catch (e) {
        console.error(`[pipeline] generation failed for module ${id}:`, e);
      }
      await setStatus(pathwayId, "READY", i + 1 < moduleIds.length ? `Generated assessments for ${i + 1}/${moduleIds.length} modules` : undefined);
    }
  } catch (e) {
    console.error("[pipeline]", e);
    await setStatus(pathwayId, "FAILED", (e as Error).message.slice(0, 500));
  }
}
