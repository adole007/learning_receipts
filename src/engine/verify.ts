/**
 * Evidence-Graph Verification Engine
 *
 * Stage 1 (deterministic, this file): structural checks + every cited quote
 *   must be located in the source chunk it claims. Quotes cited against the
 *   wrong chunk are re-anchored to the chunk that actually contains them.
 * Stage 2 (independent model, see generate.ts): an entailment check that the
 *   keyed answer is supported by the quotes and distractors are not.
 *
 * Only VERIFIED / QUOTE_ONLY questions are ever served to learners.
 */
import { locateQuote, MAX_QUOTE_TOKENS, MIN_QUOTE_TOKENS, tokenize } from "./text";

export const QUOTE_ACCEPT_THRESHOLD = 0.9;

export type ChunkRef = { id: string; text: string };

export type CandidateQuestion = {
  objectiveId: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  evidence: { chunkId: string; quote: string }[];
};

export type VerifiedEvidence = { chunkId: string; quote: string; matchStart: number; score: number };

export type Stage1Result =
  | { ok: true; groundingScore: number; evidence: VerifiedEvidence[] }
  | { ok: false; reasons: string[]; groundingScore: number };

const norm = (s: string) => tokenize(s).map((t) => t.norm).join(" ");

export function structuralIssues(q: CandidateQuestion): string[] {
  const issues: string[] = [];
  if (q.options.length < 3 || q.options.length > 5) issues.push("must have 3–5 options");
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length)
    issues.push("correctIndex out of range");
  const normed = q.options.map(norm);
  if (new Set(normed).size !== normed.length) issues.push("duplicate options");
  if (normed.some((o) => o.length === 0)) issues.push("empty option");
  if (q.options.some((o) => /all of the above|none of the above/i.test(o))) issues.push("uses all/none of the above");
  if (q.stem.trim().length < 12) issues.push("stem too short");
  const key = normed[q.correctIndex];
  if (key && key.split(" ").length >= 4 && norm(q.stem).includes(key)) issues.push("stem leaks the answer");
  if (!q.evidence.length) issues.push("no evidence cited");
  return issues;
}

/**
 * Locate each cited quote. `scope` is the set of chunks the generator was
 * allowed to use; quotes may be re-anchored only within that scope.
 */
export function verifyStage1(q: CandidateQuestion, scope: Map<string, ChunkRef>): Stage1Result {
  const reasons = structuralIssues(q);
  const verified: VerifiedEvidence[] = [];
  let scoreSum = 0;

  for (const ev of q.evidence) {
    const n = tokenize(ev.quote).length;
    if (n < MIN_QUOTE_TOKENS) {
      reasons.push(`quote too short to be meaningful evidence ("${ev.quote}")`);
      continue;
    }
    if (n > MAX_QUOTE_TOKENS) {
      reasons.push("quote too long");
      continue;
    }

    const claimed = scope.get(ev.chunkId);
    let bestChunk = claimed;
    let best = claimed ? locateQuote(ev.quote, claimed.text) : { score: 0, start: -1, end: -1, exact: false };

    if (best.score < QUOTE_ACCEPT_THRESHOLD) {
      for (const c of scope.values()) {
        if (c.id === ev.chunkId) continue;
        const m = locateQuote(ev.quote, c.text);
        if (m.score > best.score) {
          best = m;
          bestChunk = c;
        }
        if (best.score === 1) break;
      }
    }
    scoreSum += best.score;
    if (!bestChunk || best.score < QUOTE_ACCEPT_THRESHOLD) {
      reasons.push(`quote not found in source (best match ${(best.score * 100).toFixed(0)}%)`);
      continue;
    }
    // Store the span exactly as it appears in the source, not the model's rendition.
    verified.push({
      chunkId: bestChunk.id,
      quote: bestChunk.text.slice(best.start, best.end),
      matchStart: best.start,
      score: best.score,
    });
  }

  const groundingScore = q.evidence.length ? scoreSum / q.evidence.length : 0;
  if (reasons.length || !verified.length) return { ok: false, reasons, groundingScore };
  return { ok: true, groundingScore, evidence: verified };
}
