import { eq } from "drizzle-orm";

import { users } from "./db/d1-schema.ts";
import { d1 } from "./db/d1.ts";

/**
The Telegram id of a user who still exists, or `undefined` once the row is gone (the account
was deleted, or the data was reset). Callers that only hold a user id (an MCP grant, the
user's own store) use it both as an existence check and as the user's private chat id.
*/
export const telegramIdOf = async (
  binding: D1Database,
  userId: string,
): Promise<string | undefined> => {
  const row = await d1(binding).query.users.findFirst({
    columns: { telegramId: true },
    where: eq(users.id, userId),
  });
  return row?.telegramId;
};
