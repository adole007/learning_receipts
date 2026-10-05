/**
 * Traceable assessment generation for one module.
 *   1. Claude drafts questions constrained to the module's evidence chunks,
 *      citing verbatim quotes per question.
 *   2. Stage 1 verification (deterministic quote location) — verify.ts
 *   3. Stage 2 verification (independent entailment check) — below
 *   4. Persist questions + bidirectional evidence links. Rejected questions
 *      are stored for audit but never served.
 */
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { callStructured, VERIFIER_MODEL } from "./llm";
import { clip } from "./text";
import { verifyStage1, type CandidateQuestion, type ChunkRef } from "./verify";

const draftQuestionSchema = z.object({
  objectiveId: z.string(),
  stem: z.string(),
  options: z.array(z.string()).min(3).max(5),
  correctIndex: z.number().int(),
  explanation: z.string().describe("Why the answer is correct, referring only to the source"),
  difficulty: z.number().int().min(1).max(3),
  evidence: z
    .array(
      z.object({
        chunkId: z.string(),
        quote: z.string().describe("VERBATIM span copied from that chunk, 8–40 words"),
      }),
    )
    .min(1)
    .max(3),
});
const draftSchema = z.object({ questions: z.array(draftQuestionSchema) });

const judgeSchema = z.object({
  judgments: z.array(
    z.object({
      index: z.number().int(),
      answerSupported: z.boolean().describe("The keyed answer is directly supported by the quoted evidence"),
      singleBestAnswer: z.boolean().describe("No distractor is also supported by the evidence"),
      note: z.string(),
    }),
  ),
});

// Validation-only schemas (never sent to the model). Some models send arrays as JSON-encoded strings.
const parseIfString = (v: unknown) => {
  if (typeof v !== "string") return v;
  for (const candidate of [v, v.slice(v.indexOf("["), v.lastIndexOf("]") + 1)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return v;
};
/**
 * Recovers individual question objects from a stringified array that is not valid JSON as a whole
 * (e.g. one object missing its closing brace). Splits on each `{"objectiveId":` and parses segments independently.
 */
export function salvageQuestions(text: string): unknown[] {
  const starts = Array.from(text.matchAll(/\{\s*"objectiveId"\s*:/g), (m) => m.index);
  return starts.flatMap((start, i) => {
    const seg = text.slice(start, starts[i + 1] ?? text.length).replace(/[\s,\]]*$/, "");
    for (const candidate of [seg, `${seg}}`, `${seg}]}`, `${seg}"}]}`]) {
      try {
        return [JSON.parse(candidate)];
      } catch {
        // try the next repair
      }
    }
    return [];
  });
}
/** One malformed question should not discard the whole batch; each is validated individually below. */
const draftEnvelopeSchema = z.object({
  questions: z.preprocess((v) => {
    const parsed = parseIfString(v);
    return typeof parsed === "string" ? salvageQuestions(parsed) : parsed;
  }, z.array(z.unknown())),
});
const looseBool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
/** Also accepts "true"/"false" and numeric strings. */
const judgeValidateSchema = z.object({
  judgments: z.preprocess(
    parseIfString,
    z.array(
      z.object({
        index: z.coerce.number().int(),
        answerSupported: looseBool,
        singleBestAnswer: looseBool,
        note: z.string().default(""),
      }),
    ),
  ),
});

const GEN_SYSTEM = `You write assessment questions for a learning-evidence platform.
Hard constraints:
- Every question must be answerable SOLELY from the provided chunks. Do not use outside knowledge, even if true.
- For each question cite 1–3 quotes copied VERBATIM (character for character) from the chunk whose id you cite. The quotes must, together, justify the correct answer.
- 4 options, exactly one correct. Distractors must be plausible but clearly contradicted or unsupported by the evidence. No "all/none of the above".
- Mix difficulties: 1 = recall a stated fact, 2 = explain/relate ideas, 3 = apply to a short new scenario (still justified by the source).
- Do not leak the answer in the stem. Keep stems under 60 words.`;

const JUDGE_SYSTEM = `You are an independent verifier. You did NOT write these questions.
For each question, look ONLY at the quoted evidence. Decide:
- answerSupported: does the evidence directly support the keyed answer? Background knowledge does not count.
- singleBestAnswer: is every distractor unsupported or contradicted by the evidence?
Be strict: if in doubt, answer false.`;

function shuffle<T>(arr: T[]): { items: T[]; map: number[] } {
  const idx = arr.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { items: idx.map((i) => arr[i]), map: idx };
}

/** `budgetMs` must stay below the calling route's maxDuration. */
export async function generateQuestionsForModule(moduleId: string, { perObjective = 3, budgetMs = 280_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const draftDeadline = deadline - 60_000; // leave room for the entailment check
  const judgeDeadline = deadline - 10_000; // and for saving
  const db = getDb();
  const mod = await db.query.modules.findFirst({
    where: eq(schema.modules.id, moduleId),
    with: { objectives: { with: { evidence: true } } },
  });
  if (!mod) throw new Error("Module not found");

  const chunkIds = Array.from(new Set(mod.objectives.flatMap((o) => o.evidence.map((e) => e.chunkId))));
  if (!chunkIds.length) return { created: 0, rejected: 0 };
  const chunks = await db.query.sourceChunks.findMany({
    where: inArray(schema.sourceChunks.id, chunkIds),
    with: { source: { columns: { title: true } } },
  });
  const scope = new Map<string, ChunkRef>(chunks.map((c) => [c.id, { id: c.id, text: c.text }]));

  const perChunkBudget = Math.max(800, Math.floor(90_000 / chunks.length));
  // Short keys: models copy "O2" reliably, but often garble long random ids.
  const objectiveByKey = new Map(mod.objectives.map((o, i) => [`O${i + 1}`, o.id]));
  const keyOf = new Map(Array.from(objectiveByKey, ([k, id]) => [id, k]));
  const prompt = `Module: ${mod.title}
Objectives (write ${perObjective} questions for each; set objectiveId to the key in brackets, e.g. "O1"):
${mod.objectives.map((o) => `- [${keyOf.get(o.id)}] ${o.statement} (cites: ${o.evidence.map((e) => e.chunkId).join(", ")})`).join("\n")}

Evidence chunks:
${chunks.map((c) => `<chunk id="${c.id}" source="${(c.source.title ?? "").replace(/"/g, "'")}" at="${c.label}">\n${clip(c.text, perChunkBudget)}\n</chunk>`).join("\n")}

Submit with the submit_questions tool.`;

  const objectiveIds = new Set(mod.objectives.map((o) => o.id));
  const resolveObjective = (raw: string) => {
    const key = raw.trim().replace(/^\[|\]$/g, "").toUpperCase();
    return objectiveByKey.get(key) ?? (objectiveIds.has(raw) ? raw : undefined);
  };

  const draftAndCheck = async () => {
    const draft = await callStructured({
      system: GEN_SYSTEM,
      prompt,
      tool: { name: "submit_questions", description: "Submit evidence-grounded questions", schema: draftSchema },
      validate: draftEnvelopeSchema,
      maxTokens: 12000,
      deadline: draftDeadline,
    });
    const candidates: CandidateQuestion[] = draft.questions.flatMap((raw) => {
      const r = draftQuestionSchema.safeParse(raw);
      const objectiveId = r.success ? resolveObjective(r.data.objectiveId) : undefined;
      return r.success && objectiveId ? [{ ...r.data, objectiveId }] : [];
    });
    const stage1 = candidates.map((q) => ({ q, r: verifyStage1(q, scope) }));
    return { returned: draft.questions.length, stage1, passed: stage1.filter((s) => s.r.ok).length };
  };

  // Weaker models occasionally return a placeholder, malformed or near-empty draft; one redraft is cheap insurance.
  let best: Awaited<ReturnType<typeof draftAndCheck>> | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2 && (!best || best.passed < mod.objectives.length); attempt++) {
    try {
      const result = await draftAndCheck();
      if (!best || result.passed > best.passed) best = result;
      if (result.passed < mod.objectives.length) {
        console.warn(`[generate] module ${moduleId}: ${result.passed}/${result.returned} drafted questions passed stage 1`);
      }
    } catch (e) {
      lastError ??= e;
      console.error(`[generate] draft attempt ${attempt + 1} failed for module ${moduleId}:`, (e as Error).message);
    }
  }
  if (!best) throw lastError;
  const { stage1 } = best;
  if (!stage1.length) {
    throw new Error(`Draft had ${best.returned} question(s) but none were usable for this module's objectives`);
  }

  // ---- Stage 2: independent entailment check on survivors ----
  const survivors = stage1.filter((s) => s.r.ok);
  const judgments = new Map<number, z.infer<typeof judgeSchema>["judgments"][number]>();
  let judgeAvailable = !survivors.length;
  const judgePrompt = survivors
    .map((s, i) => {
      const ev = s.r.ok ? s.r.evidence : [];
      return `### Question ${i}\n${s.q.stem}\n${s.q.options.map((o, k) => `${String.fromCharCode(65 + k)}. ${o}`).join("\n")}\nKeyed answer: ${String.fromCharCode(65 + s.q.correctIndex)}\nEvidence:\n${ev.map((e) => `> ${e.quote}`).join("\n")}`;
    })
    .join("\n\n");
  for (let attempt = 0; attempt < 2 && !judgeAvailable; attempt++) {
    try {
      const out = await callStructured({
        system: JUDGE_SYSTEM,
        model: VERIFIER_MODEL(),
        prompt: judgePrompt,
        tool: { name: "submit_judgments", description: "Submit one judgment per question index", schema: judgeSchema },
        validate: judgeValidateSchema,
        maxTokens: 4000,
        deadline: judgeDeadline,
      });
      for (const j of out.judgments) judgments.set(j.index, j);
      judgeAvailable = true;
    } catch (e) {
      console.error(`[verify] entailment attempt ${attempt + 1} failed:`, (e as Error).message);
    }
  }

  let created = 0;
  let rejected = 0;
  await db.transaction(async (tx) => {
    for (const { q, r } of stage1) {
      const survivorIdx = survivors.findIndex((s) => s.q === q);
      const j = survivorIdx >= 0 ? judgments.get(survivorIdx) : undefined;

      let verification: "VERIFIED" | "QUOTE_ONLY" | "REJECTED";
      let note: string;
      if (!r.ok) {
        verification = "REJECTED";
        note = `Stage 1: ${r.reasons.join("; ")}`;
      } else if (!judgeAvailable || !j) {
        verification = judgeAvailable ? "REJECTED" : "QUOTE_ONLY";
        note = judgeAvailable ? "Stage 2: verifier returned no judgment" : "Stage 2 unavailable; quotes verified only";
      } else if (j.answerSupported && j.singleBestAnswer) {
        verification = "VERIFIED";
        note = j.note.slice(0, 300);
      } else {
        verification = "REJECTED";
        note = `Stage 2: ${!j.answerSupported ? "answer not supported by evidence" : "more than one defensible answer"} — ${j.note.slice(0, 300)}`;
      }

      const { items, map } = shuffle(q.options);
      const [row] = await tx
        .insert(schema.questions)
        .values({
          objectiveId: q.objectiveId,
          difficulty: q.difficulty,
          stem: q.stem,
          options: items,
          correctIndex: map.indexOf(q.correctIndex),
          explanation: q.explanation,
          verification,
          groundingScore: r.groundingScore,
          verifierNote: note,
        })
        .returning({ id: schema.questions.id });

      if (r.ok) {
        await tx.insert(schema.evidence).values(
          r.evidence.map((e) => ({ questionId: row.id, chunkId: e.chunkId, quote: e.quote, matchStart: e.matchStart })),
        );
      }
      if (verification === "REJECTED") rejected++;
      else {
        created++;
        await tx.insert(schema.reviewSchedules).values({ questionId: row.id });
      }
    }
    await tx.update(schema.modules).set({ questionsGeneratedAt: new Date() }).where(eq(schema.modules.id, moduleId));
  });

  return { created, rejected };
}
