/** SM-2 spaced repetition, with quality derived from correctness + self-rated confidence. */
export type SrsState = { easeFactor: number; intervalDays: number; repetitions: number };

export function qualityFrom(correct: boolean, confidence?: number | null): number {
  if (!correct) return confidence === 3 ? 0 : 1; // confidently wrong is the strongest signal to relearn
  if (confidence === 1) return 3;
  if (confidence === 3) return 5;
  return 4;
}

export function nextReview(s: SrsState, quality: number, now = new Date()): SrsState & { dueAt: Date } {
  let { easeFactor, intervalDays, repetitions } = s;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 10 / (24 * 60); // re-see in ~10 minutes
  } else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(intervalDays * easeFactor * 10) / 10;
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const dueAt = new Date(now.getTime() + intervalDays * 86_400_000);
  return { easeFactor, intervalDays, repetitions, dueAt };
}
