import { drizzle } from "drizzle-orm/d1";

import type { Db } from "../../shared/db/d1.ts";

import * as schema from "../../shared/db/d1-schema.ts";

export const d1 = (binding: D1Database): Db => drizzle(binding, { casing: "snake_case", schema });
