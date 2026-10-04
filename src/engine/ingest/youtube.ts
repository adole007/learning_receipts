import { YoutubeTranscript } from "youtube-transcript";
import { fmtTimestamp } from "../text";
import { IngestError, type ChunkDraft, type IngestResult } from "./types";

export function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    if (m) return m[1];
  }
  return null;
}

type Seg = { start: number; end: number; text: string };

/** Group caption segments into ~60s evidence windows. */
export function windowSegments(segs: Seg[], videoId: string, targetSec = 60, maxChars = 1200): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let cur: Seg[] = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].start;
    const end = cur[cur.length - 1].end;
    const text = cur.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      chunks.push({
        ordinal: chunks.length,
        locatorType: "TIMESTAMP",
        locatorStart: start,
        locatorEnd: end,
        label: `${fmtTimestamp(start)}–${fmtTimestamp(end)}`,
        deepLink: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`,
        text,
      });
    }
    cur = [];
  };
  for (const s of segs) {
    cur.push(s);
    const span = s.end - cur[0].start;
    const chars = cur.reduce((n, x) => n + x.text.length, 0);
    if (span >= targetSec || chars >= maxChars) flush();
  }
  flush();
  return chunks;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export async function ingestYoutube(u: URL): Promise<IngestResult> {
  const id = youtubeId(u);
  if (!id) throw new IngestError("Could not read the YouTube video id");

  let raw;
  try {
    raw = await YoutubeTranscript.fetchTranscript(id);
  } catch (e) {
    throw new IngestError(`No transcript available for this video (${(e as Error).message})`);
  }
  if (!raw.length) throw new IngestError("This video has no captions");

  // The library returns ms for srv3 captions and seconds for classic captions.
  const inMs = raw.some((r) => r.duration > 100 || r.offset > 36_000);
  const k = inMs ? 1 / 1000 : 1;
  const segs: Seg[] = raw.map((r) => ({
    start: r.offset * k,
    end: (r.offset + r.duration) * k,
    text: decodeEntities(r.text),
  }));

  let title = `YouTube video ${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (res.ok) title = ((await res.json()) as { title?: string }).title ?? title;
  } catch {
    /* title is optional */
  }
  return { kind: "YOUTUBE", title, chunks: windowSegments(segs, id) };
}
