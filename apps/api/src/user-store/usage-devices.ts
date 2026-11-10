import { sql } from "drizzle-orm";

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
    .select({
      at: usageSessions.endAt,
      deviceId: usageSessions.deviceId,
      latest: sql<null | number>`max(julianday(${usageSessions.endAt}))`,
    })
    .from(usageSessions)
    .groupBy(usageSessions.deviceId);
  // SQLite's single MAX selects companion bare columns from the winning source row.
  return rows.filter((row) => row.latest !== null).map(({ at, deviceId }) => ({ at, deviceId }));
};
