import { after } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { processPathway } from "@/engine/pipeline";
import { guessKind } from "@/engine/ingest";
import { handle } from "@/lib/api";
import { createSlug } from "@/lib/ids";
import { ensureLearner, getLearnerId, HttpError } from "@/lib/learner";

export const maxDuration = 300;

const body = z.object({
  title: z.string().trim().min(3).max(120),
  goal: z.string().trim().max(500).optional(),
  links: z.array(z.string().trim().url()).min(1).max(20),
});

export const POST = handle(async (req: Request) => {
  const learnerId = await getLearnerId();
  const input = body.parse(await req.json());
  const links = Array.from(new Set(input.links));
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "Server is missing ANTHROPIC_API_KEY");

  await ensureLearner(learnerId);
  const db = getDb();
  const [pathway] = await db
    .insert(schema.pathways)
    .values({ learnerId, title: input.title, goal: input.goal || null, publicSlug: createSlug() })
    .returning();
  await db.insert(schema.sources).values(links.map((url) => ({ pathwayId: pathway.id, url, kind: guessKind(url) })));

  after(() => processPathway(pathway.id));
  return { id: pathway.id };
});
