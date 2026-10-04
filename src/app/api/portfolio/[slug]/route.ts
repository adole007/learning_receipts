import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { verifyChain } from "@/engine/receipts";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/learner";
import { loadPathwayGraph } from "@/lib/queries";

/** Machine-readable portfolio export, including the full receipt chain for independent verification. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const db = getDb();
  const p = await db.query.pathways.findFirst({ where: and(eq(schema.pathways.publicSlug, slug), eq(schema.pathways.isPublic, true)) });
  if (!p) throw new HttpError(404, "Portfolio not found");
  const graph = await loadPathwayGraph(p.id);
  const chain = await db.query.receipts.findMany({ where: eq(schema.receipts.pathwayId, p.id), orderBy: asc(schema.receipts.seq) });
  const bodies = chain.map((r) => ({
    seq: r.seq,
    kind: r.kind,
    refId: r.refId,
    payload: r.payload,
    prevHash: r.prevHash,
    createdAt: r.createdAt.toISOString(),
    hash: r.hash,
  }));
  return NextResponse.json(
    {
      format: "receipts-for-learning/portfolio@1",
      pathway: { id: p.id, title: p.title, goal: p.goal },
      learner: graph?.pathway.learner.displayName,
      mastery: graph?.mastery,
      sources: graph?.pathway.sources.filter((s) => s.status === "OK").map((s) => ({ title: s.title, url: s.url, kind: s.kind, contentHash: s.contentHash })),
      chain: { verification: verifyChain(p.id, bodies), receipts: bodies },
      howToVerify:
        "For each receipt, sha256(canonicalJson({seq,kind,refId,payload,prevHash,createdAt})) must equal hash, and prevHash must equal the previous receipt's hash (first: sha256('receipts-for-learning:genesis:'+pathway.id)). canonicalJson sorts object keys recursively.",
    },
    { headers: { "content-disposition": `inline; filename="portfolio-${slug}.json"` } },
  );
});
