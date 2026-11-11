import type { SqlDatabase } from "../ports/sqlite.ts";
import type * as schema from "./d1-schema.ts";

/** Shared application SQLite contract; the deployment selects its driver. */
export type Db = SqlDatabase<typeof schema>;
