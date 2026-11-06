import { max } from "drizzle-orm";

import type { SqliteDatabase } from "../shared/ports/sqlite.ts";

import * as schema from "./schema.ts";

type Db = SqliteDatabase<"sync", typeof schema>;

/**
Each device that sent usage and the end of its newest session: when the person's sessions list
says an app or an agent last sent data.
*/
export const usageDevices = async (
  db: Db,
): Promise<readonly { readonly deviceId: string; readonly at: string }[]> => {
  const { usageSessions } = schema;
  const rows = await db
    .select({ at: max(usageSessions.endAt), deviceId: usageSessions.deviceId })
    .from(usageSessions)
    .groupBy(usageSessions.deviceId);
  return rows.filter((row): row is { at: string; deviceId: string } => row.at !== null);
};
