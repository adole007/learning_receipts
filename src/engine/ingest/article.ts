import { IngestError, type ChunkDraft, type IngestResult } from "./types";

const TARGET_CHARS = 1400;
const BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, pre, blockquote, figcaption, td";

export function paragraphsToChunks(paras: string[], url: string): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let buf: string[] = [];
  let startIdx = 1;
  const base = url.split("#")[0];
  const flush = (endIdx: number) => {
    if (!buf.length) return;
    const text = buf.join("\n\n");
    const lead = buf[0].split(/\s+/).slice(0, 8).join(" ");
    chunks.push({
      ordinal: chunks.length,
      locatorType: "PARAGRAPH",
      locatorStart: startIdx,
      locatorEnd: endIdx,
      label: startIdx === endIdx ? `¶ ${startIdx}` : `¶ ${startIdx}–${endIdx}`,
      // Scroll-to-Text Fragment: opens the page highlighting the evidence block
      deepLink: `${base}#:~:text=${encodeURIComponent(lead)}`,
      text,
    });
    buf = [];
  };
  paras.forEach((p, i) => {
    const idx = i + 1;
    if (!buf.length) startIdx = idx;
    buf.push(p);
    if (buf.join("\n\n").length >= TARGET_CHARS) flush(idx);
  });
  flush(paras.length);
  return chunks;
}

export async function ingestArticle(buf: Uint8Array, url: string): Promise<IngestResult> {
  const html = new TextDecoder("utf-8").decode(buf);
  const { parseHTML } = await import("linkedom");
  const { Readability } = await import("@mozilla/readability");

  const { document } = parseHTML(html);
  const pageTitle = document.querySelector("title")?.textContent?.trim();
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content) throw new IngestError("Could not extract readable article text from this page");

  const { document: doc } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const seen = new Set<string>();
  const paras: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(BLOCK_SELECTOR)) as Element[]) {
    // skip blocks nested in another matched block (e.g. <p> inside <li>)
    if (el.parentElement?.closest(BLOCK_SELECTOR)) continue;
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length < 25 || seen.has(t)) continue;
    seen.add(t);
    paras.push(t);
  }
  if (!paras.length && article.textContent) {
    paras.push(...article.textContent.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 25));
  }
  const chunks = paragraphsToChunks(paras, url);
  if (!chunks.length) throw new IngestError("The page had no substantial text");
  return { kind: "ARTICLE", title: article.title || pageTitle || new URL(url).hostname, chunks };
}
