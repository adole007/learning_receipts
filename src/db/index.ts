import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __rflDb: NeonDatabase<typeof schema> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(new Pool({ connectionString: url }), { schema });
}

/** Lazily created so `next build` never needs a database. */
export function getDb() {
  if (!globalThis.__rflDb) globalThis.__rflDb = create();
  return globalThis.__rflDb;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
