import { IngestError, type ChunkDraft, type IngestResult } from "./types";

const MAX_PAGE_CHARS = 5000;

export function pagesToChunks(pages: string[], url: string): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  pages.forEach((raw, i) => {
    const page = i + 1;
    const text = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 40) return; // blank / image-only page
    for (let off = 0; off < text.length; off += MAX_PAGE_CHARS) {
      chunks.push({
        ordinal: chunks.length,
        locatorType: "PAGE",
        locatorStart: page,
        locatorEnd: page,
        label: `p. ${page}`,
        deepLink: `${url.split("#")[0]}#page=${page}`,
        text: text.slice(off, off + MAX_PAGE_CHARS),
      });
    }
  });
  return chunks;
}

export async function ingestPdf(buf: Uint8Array, url: string): Promise<IngestResult> {
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(buf);
  } catch (e) {
    throw new IngestError(`Could not open PDF: ${(e as Error).message}`);
  }
  const { text } = await extractText(pdf, { mergePages: false });
  const chunks = pagesToChunks(text, url);
  if (!chunks.length) throw new IngestError("No extractable text in this PDF (it may be scanned images)");

  let title = decodeURIComponent(new URL(url).pathname.split("/").pop() || "PDF document");
  try {
    const meta = await getMeta(pdf);
    const t = (meta.info as { Title?: string } | undefined)?.Title;
    if (t && t.trim().length > 2) title = t.trim();
  } catch {
    /* optional */
  }
  return { kind: "PDF", title, chunks };
}
