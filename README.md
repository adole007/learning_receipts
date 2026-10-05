# Receipts for Learning — MVP

Turn any free, learner-chosen material (YouTube videos, PDFs, articles) into a structured, assessable and **verifiable** learning pathway.

> AI structures and assesses. The learner's sources remain the source of truth.

**Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM · Neon Postgres · Claude API

---

## Quick start

```bash
npm install
cp .env.example .env.local        # add DATABASE_URL (Neon) and ANTHROPIC_API_KEY (or NVIDIA_API_KEY as a fallback)
npx drizzle-kit migrate           # or: psql "$DATABASE_URL" -f drizzle/0000_init.sql
npm run dev                       # http://localhost:3000
```

Tests: `npm test` (21 tests covering the verification engine, mastery model, spaced revision, receipt chain and parsers).

### Deploy (Vercel)
1. Push to GitHub, import into Vercel.
2. Set `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, and either `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, optionally `ANTHROPIC_VERIFIER_MODEL`) or `NVIDIA_API_KEY` (+ `NVIDIA_MODEL`).
3. Work is split so each step fits in one function invocation (`maxDuration = 300`, which needs Pro or Hobby with Fluid compute): ingestion and structuring run in `after()` on pathway creation, then the pathway page calls `POST /api/modules/[id]/generate` for each module in turn. Each step has a 280s time budget; a step that runs out of time fails cleanly and can be retried from its button.

---

## How the innovation claims map to code

| Claim | Where | What it does |
|---|---|---|
| **(a) Traceable assessment generation** — Evidence-Graph Verification Engine | `src/engine/verify.ts`, `src/engine/generate.ts`, `src/engine/text.ts` | Questions are generated only from the module's evidence chunks and must cite verbatim quotes. **Stage 1** (deterministic): every quote is located in the source by token matching (exact, then LCS-fuzzy ≥ 90%); quotes cited against the wrong chunk are re-anchored; the stored quote is the source's own span, not the model's rendition. Structural checks reject duplicate options, answer leakage, "all/none of the above". **Stage 2**: an independent verifier call judges whether the quoted evidence supports the keyed answer and rules out every distractor. Rejected questions are kept for audit but never served. |
| Bidirectional evidence links | `evidence` + `objective_evidence` tables (`src/db/schema.ts`) | Question ↔ quote ↔ chunk ↔ source, where every chunk has a locator (page / timestamp / paragraph) and a deep link (`#page=N`, `&t=Ns`, `#:~:text=`). |
| **(b) Outcome-based mastery model** | `src/engine/mastery.ts` | Readiness = weighted coverage (25%), recency-weighted mastery (35%), retention on delayed re-tests (25%), applied-task rubric score (15%). Discounted by evidence sufficiency; capped at 70 without retention evidence and 85 without an applied task. Time-watched is never an input. Every component is shown to the learner. |
| **(c) Source-agnostic structuring** | `src/engine/ingest/*`, `src/engine/structure.ts` | All inputs normalise to one `source_chunk` shape. Claude groups chunks across sources into modules and measurable objectives; any objective that cites no valid chunk is dropped. |
| Spaced revision | `src/engine/srs.ts` | SM-2 with quality from correctness × self-rated confidence (confidently wrong = strongest relearn signal). |
| **Verifiable portfolio ("receipts")** | `src/engine/receipts.ts`, `src/engine/ledger.ts`, `/p/[slug]`, `/api/portfolio/[slug]` | Each attempt / task submission is appended to a per-pathway SHA-256 hash chain (serialised with an advisory lock). The public page shows chain integrity; the JSON export contains everything needed to re-verify independently. Source text is also hashed at ingestion. |

## App map

- `/` — create a pathway (title, goal, links), list your pathways
- `/pathways/[id]` — processing status → readiness dashboard, modules, objectives with evidence chips, verification stats, sources, publish toggle
- `/pathways/[id]/practice` — quiz (`?moduleId=` for one module, `?mode=review` for due revision items) with evidence shown after every answer
- `/pathways/[id]/modules/[moduleId]` — applied tasks with evidence-anchored rubrics and grading
- `/p/[slug]` — public portfolio (only when published)

## Known MVP limitations (next steps)

- **Auth:** identity is an anonymous httpOnly cookie (`src/middleware.ts`). Add real accounts (Neon Auth or Auth.js) before launch so learners can sign in on other devices.
- **YouTube transcripts** use the unofficial `youtube-transcript` package; it can break or be rate-limited from cloud IPs. For production, use a transcript provider or the YouTube Data API captions endpoint for owned content, and fall back to Whisper on audio where licensing allows.
- **Scanned PDFs** have no text layer — add OCR.
- **Paywalled / JS-rendered pages** won't extract; a headless-browser fetcher would help.
- **Rate limiting & cost controls** per learner are not yet implemented.
- **Re-ingestion drift:** sources are hashed at ingestion; a scheduled job could re-fetch and flag evidence whose source changed.
