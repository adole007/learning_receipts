import { desc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { getDb } from "@/db";
import { genesisHash, hashReceipt, type ReceiptBody } from "./receipts";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Append a learning event to the pathway's receipt chain (serialised per pathway). */
export async function appendReceipt(
  tx: Tx,
  pathwayId: string,
  kind: ReceiptBody["kind"],
  refId: string,
  payload: Record<string, unknown>,
  at: Date,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pathwayId}))`);
  const [last] = await tx
    .select({ seq: schema.receipts.seq, hash: schema.receipts.hash })
    .from(schema.receipts)
    .where(eq(schema.receipts.pathwayId, pathwayId))
    .orderBy(desc(schema.receipts.seq))
    .limit(1);
  const body: ReceiptBody = {
    seq: (last?.seq ?? 0) + 1,
    kind,
    refId,
    payload,
    prevHash: last?.hash ?? genesisHash(pathwayId),
    createdAt: at.toISOString(),
  };
  const hash = hashReceipt(body);
  await tx.insert(schema.receipts).values({
    pathwayId,
    seq: body.seq,
    kind,
    refId,
    payload,
    prevHash: body.prevHash,
    hash,
    createdAt: at,
  });
  return { seq: body.seq, hash };
}
