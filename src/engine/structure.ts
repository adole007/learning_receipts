/**
 * Source-agnostic structuring: normalises heterogeneous chunks (pages,
 * transcript windows, paragraphs) into an ordered set of modules and
 * learning objectives. Every objective must cite the chunk ids it is drawn
 * from; objectives without valid evidence are discarded.
 */
import { z } from "zod";
import { callStructured } from "./llm";
import { clip } from "./text";

export type StructChunk = { id: string; sourceTitle: string; label: string; text: string };

export const structureSchema = z.object({
  modules: z
    .array(
      z.object({
        title: z.string().min(3).max(120),
        summary: z.string().min(10).max(600),
        objectives: z
          .array(
            z.object({
              statement: z.string().min(8).max(300).describe("Learner-facing, starts with a measurable verb"),
              bloom: z.enum(["remember", "understand", "apply", "analyse"]),
              chunkIds: z.array(z.string()).min(1).describe("Ids of the chunks that teach this objective"),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(12),
});
export type StructuredPathway = z.infer<typeof structureSchema>;

const SYSTEM = `You are the structuring stage of a learning-evidence platform.
You organise a learner's own chosen materials into a coherent pathway WITHOUT adding outside knowledge.
Rules:
- Use ONLY the provided chunks. Never introduce topics the chunks do not teach.
- Group related chunks (even across different sources) into modules, ordered from foundational to advanced.
- Write 2–6 objectives per module. Each must be measurable (Explain, Identify, Compare, Apply, Calculate...) and cite the exact chunk ids that teach it.
- Ignore chunks that are boilerplate (sponsor reads, navigation, cookie notices, subscribe prompts).
- Prefer fewer, meatier modules over many thin ones.`;

/** Budget the prompt: whole chunks when small, trimmed excerpts when the corpus is large. */
export function renderChunksForStructuring(chunks: StructChunk[], budgetChars = 160_000) {
  const per = Math.max(300, Math.floor(budgetChars / Math.max(chunks.length, 1)) - 80);
  return chunks
    .map((c) => `<chunk id="${c.id}" source="${c.sourceTitle.replace(/"/g, "'")}" at="${c.label}">\n${clip(c.text, per)}\n</chunk>`)
    .join("\n");
}

export function sanitiseStructure(s: StructuredPathway, validIds: Set<string>): StructuredPathway {
  const modules = s.modules
    .map((m) => ({
      ...m,
      objectives: m.objectives
        .map((o) => ({ ...o, chunkIds: Array.from(new Set(o.chunkIds.filter((id) => validIds.has(id)))) }))
        .filter((o) => o.chunkIds.length > 0),
    }))
    .filter((m) => m.objectives.length > 0);
  return { modules };
}

export async function structurePathway(input: { title: string; goal?: string | null; chunks: StructChunk[]; deadline?: number }) {
  const prompt = `Pathway title: ${input.title}
${input.goal ? `Learner goal: ${input.goal}\n` : ""}
Here are the learner's materials, split into addressable evidence chunks:

${renderChunksForStructuring(input.chunks)}

Organise these into modules and objectives using the submit_structure tool.`;

  const raw = await callStructured({
    system: SYSTEM,
    prompt,
    tool: { name: "submit_structure", description: "Submit the pathway structure", schema: structureSchema },
    maxTokens: 8000,
    deadline: input.deadline,
  });
  const structured = sanitiseStructure(raw, new Set(input.chunks.map((c) => c.id)));
  if (!structured.modules.length) throw new Error("Structuring produced no evidence-backed objectives");
  return structured;
}
