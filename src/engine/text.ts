/**
 * Quote location — the first gate of the Evidence-Graph Verification Engine.
 *
 * A generated question is only admissible if every quote it cites can be
 * located inside the source chunk it claims to come from. We match on
 * normalised word tokens (robust to whitespace, curly quotes, casing and
 * punctuation from PDF/transcript extraction) and fall back to a sliding
 * bag-of-words window to tolerate minor transcription differences.
 */

export type Token = { norm: string; start: number; end: number };

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const raw = m[0];
    out.push({
      norm: raw.toLowerCase().replace(/['’]/g, ""),
      start: m.index!,
      end: m.index! + raw.length,
    });
  }
  return out;
}

export type QuoteMatch = {
  /** 0..1 — 1 means an exact token-sequence match. */
  score: number;
  /** Char offset of the match in the haystack, -1 if not located. */
  start: number;
  end: number;
  exact: boolean;
};

export const MIN_QUOTE_TOKENS = 5;
export const MAX_QUOTE_TOKENS = 80;

export function locateQuote(quote: string, haystack: string): QuoteMatch {
  const q = tokenize(quote);
  const h = tokenize(haystack);
  const none: QuoteMatch = { score: 0, start: -1, end: -1, exact: false };
  if (q.length === 0 || h.length === 0) return none;

  // 1) exact contiguous token match
  const first = q[0].norm;
  for (let i = 0; i + q.length <= h.length; i++) {
    if (h[i].norm !== first) continue;
    let ok = true;
    for (let j = 1; j < q.length; j++) {
      if (h[i + j].norm !== q[j].norm) {
        ok = false;
        break;
      }
    }
    if (ok) return { score: 1, start: h[i].start, end: h[i + q.length - 1].end, exact: true };
  }

  // 2) fuzzy: best in-order token overlap (LCS) over windows near quote length
  const qn = q.map((t) => t.norm);
  let best = none;
  const sizes = [q.length, q.length + 2, Math.max(1, q.length - 2)];
  for (const size of sizes) {
    if (size > h.length) continue;
    for (let i = 0; i + size <= h.length; i++) {
      const win = h.slice(i, i + size);
      const lcs = lcsLength(qn, win.map((t) => t.norm));
      const score = lcs / Math.max(q.length, 1);
      if (score > best.score) {
        best = { score, start: win[0].start, end: win[win.length - 1].end, exact: false };
        if (score >= 0.999) return best;
      }
    }
  }
  return best;
}

function lcsLength(a: string[], b: string[]): number {
  const dp = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function wordCount(s: string) {
  return tokenize(s).length;
}

export function clip(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

export function fmtTimestamp(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
