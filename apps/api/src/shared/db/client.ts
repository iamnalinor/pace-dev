import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

export const createDatabase = (url: string) => {
  const client = postgres(url, { onnotice: () => undefined });
  const db = drizzle({ casing: "snake_case", client, schema });
  return {
    close: async (): Promise<void> => {
      await client.end();
    },
    db,
  };
};

export type Database = ReturnType<typeof createDatabase>["db"];
