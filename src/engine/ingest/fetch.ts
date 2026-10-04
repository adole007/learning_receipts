import { IngestError } from "./types";

const MAX_BYTES = 30 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; ReceiptsForLearning/0.1; +https://example.com/bot)";

export async function fetchWithLimit(url: string, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/pdf,application/xhtml+xml,*/*;q=0.8" },
    });
    if (!res.ok) throw new IngestError(`Fetch failed (${res.status}) for ${url}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new IngestError("File is larger than 30 MB");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new IngestError("File is larger than 30 MB");
    return { buf, contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
  } catch (e) {
    if (e instanceof IngestError) throw e;
    throw new IngestError(`Could not fetch ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Basic SSRF guard — only public http(s) URLs. */
export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new IngestError(`Not a valid URL: ${raw}`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new IngestError("Only http(s) links are supported");
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]"
  ) {
    throw new IngestError("Private network addresses are not allowed");
  }
  return u;
}
