import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";

const LEARNER_COOKIE = "rfl_lid";

export async function getLearnerId(): Promise<string> {
  const id = (await cookies()).get(LEARNER_COOKIE)?.value;
  if (!id) throw new HttpError(401, "No learner session");
  return id;
}

export async function ensureLearner(id: string) {
  await getDb().insert(schema.learners).values({ id }).onConflictDoNothing();
}

export async function requireOwnedPathway(pathwayId: string) {
  const learnerId = await getLearnerId();
  const p = await getDb().query.pathways.findFirst({
    where: and(eq(schema.pathways.id, pathwayId), eq(schema.pathways.learnerId, learnerId)),
  });
  if (!p) throw new HttpError(404, "Pathway not found");
  return p;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
