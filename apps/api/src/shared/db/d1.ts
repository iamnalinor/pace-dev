import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./d1-schema.ts";

export type Db = DrizzleD1Database<typeof schema>;

/** Drizzle over the D1 binding; created per request (bindings are only valid inside one). */
export const d1 = (binding: D1Database): Db => drizzle(binding, { casing: "snake_case", schema });
