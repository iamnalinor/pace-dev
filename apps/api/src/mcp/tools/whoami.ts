import { z } from "zod";

import { defineTool } from "../registry.ts";

/** The first tool: lets a client (and a person debugging a connection) see who the token is. */
export const whoami = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "Returns the Pace account behind this connection: its user id, Telegram id, the scopes the person granted, and the server time (ISO 8601, UTC).",
  handler: (_args, grant) => {
    const result = {
      scopes: [...grant.scopes],
      serverTime: new Date().toISOString(),
      telegramId: grant.telegramId,
      userId: grant.userId,
    };
    return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
  },
  input: {},
  name: "whoami",
  output: {
    scopes: z.array(z.string()),
    serverTime: z.string(),
    telegramId: z.string(),
    userId: z.string(),
  },
  scope: "tasks:read",
  title: "Who am I",
});
