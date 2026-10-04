/**
 * Receipt chain — every learning event is hashed together with the previous
 * receipt (like a ledger). Anyone holding the exported portfolio can recompute
 * the chain and detect edits, insertions or deletions.
 */
import { createHash } from "node:crypto";

export type ReceiptBody = {
  seq: number;
  kind: "ATTEMPT" | "TASK_SUBMISSION";
  refId: string;
  payload: Record<string, unknown>;
  prevHash: string;
  createdAt: string; // ISO
};

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const genesisHash = (pathwayId: string) => sha256(`receipts-for-learning:genesis:${pathwayId}`);
export const hashReceipt = (b: ReceiptBody) => sha256(canonicalJson(b));

export function verifyChain(pathwayId: string, chain: (ReceiptBody & { hash: string })[]) {
  let prev = genesisHash(pathwayId);
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (r.seq !== i + 1) return { valid: false as const, brokenAt: i + 1, reason: "sequence gap" };
    if (r.prevHash !== prev) return { valid: false as const, brokenAt: r.seq, reason: "previous hash mismatch" };
    const { hash, ...body } = r;
    if (hashReceipt(body) !== hash) return { valid: false as const, brokenAt: r.seq, reason: "content altered" };
    prev = hash;
  }
  return { valid: true as const, head: prev, length: chain.length };
}
