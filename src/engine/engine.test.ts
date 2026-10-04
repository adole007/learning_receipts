import { describe, expect, it } from "vitest";
import { locateQuote } from "./text";
import { verifyStage1, structuralIssues, type CandidateQuestion } from "./verify";
import { computeMastery, type AttemptLite } from "./mastery";
import { nextReview, qualityFrom } from "./srs";
import { canonicalJson, genesisHash, hashReceipt, verifyChain, type ReceiptBody } from "./receipts";
import { sanitiseStructure } from "./structure";
import { windowSegments, youtubeId } from "./ingest/youtube";
import { pagesToChunks } from "./ingest/pdf";
import { paragraphsToChunks } from "./ingest/article";

const PAGE = `Gradient descent is an optimisation algorithm. At each step, the weights are moved
in the direction of the negative gradient of the loss, scaled by the learning rate.
If the learning rate is too large, training can diverge; if it is too small, convergence is slow.`;

describe("locateQuote", () => {
  it("finds exact matches despite whitespace, case and curly quotes", () => {
    const m = locateQuote("the WEIGHTS are moved in the direction of the negative gradient", PAGE);
    expect(m.exact).toBe(true);
    expect(m.score).toBe(1);
    expect(PAGE.slice(m.start, m.end)).toMatch(/^the weights are moved\s+in the direction/);
  });
  it("tolerates a dropped word via fuzzy match", () => {
    const m = locateQuote("if the learning rate is too large training will diverge", PAGE);
    expect(m.exact).toBe(false);
    expect(m.score).toBeGreaterThan(0.8);
  });
  it("rejects fabricated quotes", () => {
    const m = locateQuote("momentum accelerates convergence by accumulating past gradients", PAGE);
    expect(m.score).toBeLessThan(0.5);
  });
});

const base: CandidateQuestion = {
  objectiveId: "o1",
  stem: "What happens if the learning rate is set too large?",
  options: ["Training can diverge", "Convergence becomes slow", "The gradient becomes zero", "The loss is ignored"],
  correctIndex: 0,
  explanation: "The source says a too-large learning rate can cause divergence.",
  difficulty: 1,
  evidence: [{ chunkId: "c1", quote: "If the learning rate is too large, training can diverge" }],
};
const scope = new Map([
  ["c1", { id: "c1", text: PAGE }],
  ["c2", { id: "c2", text: "Unrelated chunk about data cleaning and missing values in tabular datasets." }],
]);

describe("verifyStage1", () => {
  it("accepts a grounded question and stores the source's own span", () => {
    const r = verifyStage1(base, scope);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evidence[0].quote).toBe("If the learning rate is too large, training can diverge");
  });
  it("re-anchors a quote cited against the wrong chunk", () => {
    const r = verifyStage1({ ...base, evidence: [{ chunkId: "c2", quote: base.evidence[0].quote }] }, scope);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evidence[0].chunkId).toBe("c1");
  });
  it("rejects hallucinated evidence", () => {
    const r = verifyStage1({ ...base, evidence: [{ chunkId: "c1", quote: "Adam uses adaptive per-parameter learning rates for stability" }] }, scope);
    expect(r.ok).toBe(false);
  });
  it("rejects too-short quotes and structural problems", () => {
    expect(verifyStage1({ ...base, evidence: [{ chunkId: "c1", quote: "too large" }] }, scope).ok).toBe(false);
    expect(structuralIssues({ ...base, options: ["A", "A", "B", "C"] })).toContain("duplicate options");
    expect(structuralIssues({ ...base, correctIndex: 7 })).toContain("correctIndex out of range");
    expect(structuralIssues({ ...base, options: ["x", "y", "z", "None of the above"] })).toContain("uses all/none of the above");
  });
});

describe("mastery model", () => {
  const t0 = new Date("2026-10-01T09:00:00Z").getTime();
  const at = (h: number) => new Date(t0 + h * 3_600_000);
  const A = (q: string, o: string, correct: boolean, h: number, isReview = false): AttemptLite => ({ questionId: q, objectiveId: o, correct, isReview, createdAt: at(h) });

  it("is zero with no evidence", () => {
    const m = computeMastery({ objectiveIds: ["o1", "o2"], attempts: [], taskScores: [] });
    expect(m.readiness).toBe(0);
    expect(m.retention).toBeNull();
  });
  it("caps readiness without retention evidence", () => {
    const attempts = ["o1", "o2"].flatMap((o) => [A(`${o}q1`, o, true, 0), A(`${o}q2`, o, true, 0.1), A(`${o}q3`, o, true, 0.2)]);
    const m = computeMastery({ objectiveIds: ["o1", "o2"], attempts, taskScores: [] });
    expect(m.coverage).toBe(1);
    expect(m.readiness).toBe(70);
    expect(m.caps.length).toBeGreaterThan(0);
  });
  it("measures retention from delayed re-answers", () => {
    const attempts = [A("q1", "o1", true, 0), A("q2", "o1", true, 0), A("q3", "o1", true, 0), A("q1", "o1", true, 30), A("q2", "o1", false, 30), A("q3", "o1", true, 30)];
    const m = computeMastery({ objectiveIds: ["o1"], attempts, taskScores: [1] });
    expect(m.retention).toBeCloseTo(2 / 3);
    expect(m.application).toBe(1);
    expect(m.readiness).toBeGreaterThan(70);
  });
  it("detects an improving trend", () => {
    const attempts = Array.from({ length: 15 }, (_, i) => A(`q${i}`, "o1", i >= 5 ? i % 5 !== 0 || i >= 10 : i % 5 === 0, i * 0.01));
    expect(computeMastery({ objectiveIds: ["o1"], attempts, taskScores: [] }).trend.label).toBe("improving");
  });
});

describe("spaced revision", () => {
  it("follows SM-2 intervals and resets on failure", () => {
    let s = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
    s = nextReview(s, qualityFrom(true, 2));
    expect(s.intervalDays).toBe(1);
    s = nextReview(s, qualityFrom(true, 3));
    expect(s.intervalDays).toBe(3);
    s = nextReview(s, qualityFrom(true, 3));
    expect(s.intervalDays).toBeGreaterThan(6);
    s = nextReview(s, qualityFrom(false, 3));
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBeLessThan(0.01);
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
});

describe("receipt chain", () => {
  const pid = "pathway1";
  function build(n: number) {
    const out: (ReceiptBody & { hash: string })[] = [];
    let prev = genesisHash(pid);
    for (let i = 1; i <= n; i++) {
      const body: ReceiptBody = { seq: i, kind: "ATTEMPT", refId: `a${i}`, payload: { correct: i % 2 === 0, z: 1, a: [1, { y: 2, b: 3 }] }, prevHash: prev, createdAt: new Date(2026, 9, i).toISOString() };
      const hash = hashReceipt(body);
      out.push({ ...body, hash });
      prev = hash;
    }
    return out;
  }
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it("verifies an intact chain and detects tampering", () => {
    const chain = build(5);
    expect(verifyChain(pid, chain).valid).toBe(true);
    const tampered = chain.map((r) => ({ ...r, payload: { ...r.payload } }));
    tampered[2].payload.correct = true;
    expect(verifyChain(pid, tampered)).toMatchObject({ valid: false, brokenAt: 3 });
    expect(verifyChain(pid, [chain[0], chain[2]])).toMatchObject({ valid: false });
  });
});

describe("structuring sanitiser", () => {
  it("drops objectives citing unknown chunks and empty modules", () => {
    const out = sanitiseStructure(
      {
        modules: [
          { title: "Mod A", summary: "Summary A here", objectives: [{ statement: "Explain X well", bloom: "understand", chunkIds: ["c1", "ghost"] }] },
          { title: "Mod B", summary: "Summary B here", objectives: [{ statement: "Explain Y well", bloom: "understand", chunkIds: ["ghost"] }] },
        ],
      },
      new Set(["c1"]),
    );
    expect(out.modules).toHaveLength(1);
    expect(out.modules[0].objectives[0].chunkIds).toEqual(["c1"]);
  });
});

describe("ingestion chunkers", () => {
  it("parses YouTube ids", () => {
    expect(youtubeId(new URL("https://youtu.be/dQw4w9WgXcQ?t=3"))).toBe("dQw4w9WgXcQ");
    expect(youtubeId(new URL("https://www.youtube.com/watch?v=abc123XYZ_-&list=x"))).toBe("abc123XYZ_-");
    expect(youtubeId(new URL("https://www.youtube.com/shorts/abcdefghijk"))).toBe("abcdefghijk");
    expect(youtubeId(new URL("https://example.com/watch?v=nope"))).toBeNull();
  });
  it("windows transcripts with timestamp deep links", () => {
    const segs = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `segment ${i}` }));
    const chunks = windowSegments(segs, "vid");
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[1].deepLink).toBe(`https://www.youtube.com/watch?v=vid&t=${Math.floor(chunks[1].locatorStart)}s`);
    expect(chunks[0].label).toMatch(/^0:00–1:0\d$/);
  });
  it("maps PDF pages to #page anchors and skips blank pages", () => {
    const chunks = pagesToChunks(["", "Page two has enough text to count as a real page of content."], "https://x.org/a.pdf");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ locatorStart: 2, label: "p. 2", deepLink: "https://x.org/a.pdf#page=2" });
  });
  it("groups article paragraphs with text-fragment links", () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1} `.repeat(40));
    const chunks = paragraphsToChunks(paras, "https://blog.example.com/post#top");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].deepLink.startsWith("https://blog.example.com/post#:~:text=Paragraph")).toBe(true);
  });
});
