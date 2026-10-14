import { listDurableObjectIds } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { API_ORIGIN, mcpCall, obtainToken } from "./oauth-flow.ts";

const userIdOf = async (telegramId: string): Promise<string> => {
  const row = await env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error(`no user ${telegramId}`);
  }
  return row.id;
};

describe("an MCP grant whose user is gone", () => {
  it("is refused with invalid_token and never reaches a store", async () => {
    // A token minted before the data reset (or before the account was deleted): its grant
    // names a user id that no longer exists.
    const { tokens } = await obtainToken({ devTelegramId: "1002" });
    const userId = await userIdOf("1002");
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    const response = await mcpCall(tokens.access_token, "tools/list");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_token" });
    const challenge = response.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(
      `resource_metadata="${API_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );
    const ghost = env.USER_STORE.idFromName(userId);
    const created = await listDurableObjectIds(env.USER_STORE);
    expect(created.some((id) => id.equals(ghost))).toBe(false);
  });
});
