import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ingestArticle } from "./ingest/article";
import { ingestPdf } from "./ingest/pdf";
import { locateQuote } from "./text";

const fx = (f: string) => path.join(__dirname, "__fixtures__", f);

describe("real parsers on fixtures", () => {
  it("extracts article paragraphs via Readability", async () => {
    const body = Array.from({ length: 8 }, (_, i) => `<p>Paragraph ${i + 1}: SQL joins combine rows from two tables based on a related column. An inner join keeps only matching rows, while a left join keeps every row from the left table.</p>`).join("");
    const html = `<html><head><title>Joins explained</title></head><body><nav>Home | About | Cookie settings</nav><article><h1>Joins explained</h1>${body}</article><footer>© 2026</footer></body></html>`;
    const res = await ingestArticle(new TextEncoder().encode(html), "https://blog.example.com/joins");
    expect(res.title).toMatch(/Joins explained/);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks.map((c) => c.text).join(" ")).not.toMatch(/Cookie settings/);
    expect(locateQuote("a left join keeps every row from the left table", res.chunks[0].text).exact).toBe(true);
  });

  it("extracts per-page PDF text with page anchors", async () => {
    const res = await ingestPdf(new Uint8Array(readFileSync(fx("sample.pdf"))), "https://x.org/gd.pdf");
    expect(res.title).toBe("Intro to Gradient Descent");
    expect(res.chunks.map((c) => c.label)).toEqual(["p. 1", "p. 2"]);
    expect(locateQuote("If the learning rate is too large, training can diverge", res.chunks[1].text).score).toBe(1);
  });
});
