import { ingestArticle } from "./article";
import { assertPublicUrl, fetchWithLimit } from "./fetch";
import { ingestPdf } from "./pdf";
import { IngestError, type IngestResult, type SourceKind } from "./types";
import { ingestYoutube, youtubeId } from "./youtube";

export * from "./types";

export function guessKind(raw: string): SourceKind {
  const u = new URL(raw);
  if (youtubeId(u)) return "YOUTUBE";
  if (/\.pdf$/i.test(u.pathname)) return "PDF";
  return "ARTICLE";
}

export async function ingestUrl(raw: string): Promise<IngestResult> {
  const u = assertPublicUrl(raw);
  if (youtubeId(u)) return ingestYoutube(u);

  const { buf, contentType, finalUrl } = await fetchWithLimit(u.toString());
  assertPublicUrl(finalUrl);
  const isPdf = contentType.includes("application/pdf") || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46); // %PDF
  if (isPdf) return ingestPdf(buf, finalUrl);
  if (contentType && !/html|xml|text\/plain/.test(contentType)) {
    throw new IngestError(`Unsupported content type: ${contentType.split(";")[0]}`);
  }
  return ingestArticle(buf, finalUrl);
}
