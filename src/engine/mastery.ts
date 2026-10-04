/**
 * Outcome-based mastery model. Learning is measured by demonstrated
 * performance — never by time spent or content consumed — and every
 * component is exposed so the score is explainable to learners and employers.
 */

export type AttemptLite = {
  questionId: string;
  objectiveId: string;
  correct: boolean;
  isReview: boolean;
  createdAt: Date;
};

export type MasteryInput = {
  objectiveIds: string[];
  attempts: AttemptLite[];
  /** Best score (0..1) per applied task the learner has submitted. */
  taskScores: number[];
  now?: Date;
};

export type Component = { key: string; label: string; value: number | null; weight: number; explain: string };

export type MasteryReport = {
  readiness: number; // 0..100
  band: "Building" | "Developing" | "Competent" | "Ready";
  components: Component[];
  coverage: number;
  accuracyRecent: number | null;
  trend: { slope: number; label: "improving" | "steady" | "declining" | "not enough data"; series: number[] };
  retention: number | null;
  application: number | null;
  evidenceSufficiency: number;
  caps: string[];
  perObjective: Record<string, { mastery: number; attempts: number }>;
};

const EWMA_ALPHA = 0.35;
/** A re-answer counts as a retention probe if this long has passed since the last attempt on that question. */
export const RETENTION_GAP_MS = 20 * 3_600_000;

export function computeMastery({ objectiveIds, attempts, taskScores }: MasteryInput): MasteryReport {
  const sorted = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // per-objective EWMA mastery
  const perObjective: MasteryReport["perObjective"] = {};
  for (const id of objectiveIds) perObjective[id] = { mastery: 0, attempts: 0 };
  for (const a of sorted) {
    const o = perObjective[a.objectiveId];
    if (!o) continue;
    o.mastery = o.attempts === 0 ? (a.correct ? 1 : 0) : EWMA_ALPHA * (a.correct ? 1 : 0) + (1 - EWMA_ALPHA) * o.mastery;
    o.attempts++;
  }
  const nObj = Math.max(objectiveIds.length, 1);

  // topic coverage: objectives with at least one correct answer
  const correctObjs = new Set(sorted.filter((a) => a.correct).map((a) => a.objectiveId));
  const coverage = objectiveIds.filter((id) => correctObjs.has(id)).length / nObj;

  const masteryAvg = objectiveIds.reduce((s, id) => s + perObjective[id].mastery, 0) / nObj;

  // performance trend: accuracy over consecutive blocks of 5 attempts, least-squares slope
  const BLOCK = 5;
  const series: number[] = [];
  for (let i = 0; i + BLOCK <= sorted.length; i += BLOCK) {
    series.push(sorted.slice(i, i + BLOCK).filter((a) => a.correct).length / BLOCK);
  }
  const slope = linearSlope(series);
  const trendLabel = series.length < 2 ? "not enough data" : slope > 0.03 ? "improving" : slope < -0.03 ? "declining" : "steady";
  const last = sorted.slice(-10);
  const accuracyRecent = last.length ? last.filter((a) => a.correct).length / last.length : null;

  // retention: accuracy on delayed re-answers (or explicit revision sessions)
  const lastSeen = new Map<string, number>();
  let probes = 0;
  let retained = 0;
  for (const a of sorted) {
    const prev = lastSeen.get(a.questionId);
    const t = a.createdAt.getTime();
    if (prev !== undefined && (a.isReview || t - prev >= RETENTION_GAP_MS)) {
      probes++;
      if (a.correct) retained++;
    }
    lastSeen.set(a.questionId, t);
  }
  const retention = probes >= 3 ? retained / probes : null;

  const application = taskScores.length ? taskScores.reduce((s, x) => s + x, 0) / taskScores.length : null;

  const components: Component[] = [
    { key: "coverage", label: "Topic coverage", value: coverage, weight: 0.25, explain: "Share of objectives answered correctly at least once" },
    { key: "mastery", label: "Demonstrated mastery", value: masteryAvg, weight: 0.35, explain: "Recency-weighted accuracy per objective, averaged" },
    { key: "retention", label: "Retention", value: retention, weight: 0.25, explain: "Accuracy when re-tested after ≥20h (needs 3+ probes)" },
    { key: "application", label: "Application", value: application, weight: 0.15, explain: "Rubric score on applied tasks graded against the sources" },
  ];

  // weighted mean over available components
  const avail = components.filter((c) => c.value !== null);
  const wsum = avail.reduce((s, c) => s + c.weight, 0);
  let raw = wsum ? avail.reduce((s, c) => s + c.weight * (c.value as number), 0) / wsum : 0;

  // evidence sufficiency: ~2 attempts per objective for full confidence
  const evidenceSufficiency = Math.min(1, sorted.length / (2 * nObj));
  raw *= 0.6 + 0.4 * evidenceSufficiency;

  const caps: string[] = [];
  if (retention === null && raw > 0.7) {
    raw = 0.7;
    caps.push("Capped at 70 until retention is demonstrated through spaced revision");
  }
  if (application === null && raw > 0.85) {
    raw = 0.85;
    caps.push("Capped at 85 until at least one applied task is completed");
  }

  const readiness = Math.round(raw * 100);
  const band = readiness >= 85 ? "Ready" : readiness >= 70 ? "Competent" : readiness >= 40 ? "Developing" : "Building";
  return {
    readiness,
    band,
    components,
    coverage,
    accuracyRecent,
    trend: { slope, label: trendLabel, series },
    retention,
    application,
    evidenceSufficiency,
    caps,
    perObjective,
  };
}

export function linearSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}
