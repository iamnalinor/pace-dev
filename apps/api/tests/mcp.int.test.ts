import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { providerOptions } from "../src/worker.ts";
import { readJson } from "./helpers.ts";
import {
  API_ORIGIN,
  authorizeQuery,
  codeFrom,
  exchangeCode,
  mcpCall,
  mcpResult,
  obtainToken,
  pkce,
  registerClient,
} from "./oauth-flow.ts";

type Tool = {
  name: string;
  title?: string;
  annotations?: Record<string, unknown>;
  inputSchema: { type: string };
};
type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
};

describe("MCP endpoint", () => {
  it("initializes a stateless session and lists the tools with their annotations", async () => {
    const { tokens } = await obtainToken();
    const init = await mcpCall(tokens.access_token, "initialize", {
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
      protocolVersion: "2025-06-18",
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();
    expect(await readJson<{ result: { capabilities: { tools: object } } }>(init)).toMatchObject({
      result: { capabilities: { tools: {} }, serverInfo: { name: "pace" } },
    });

    const listed = await mcpResult<{ tools: Tool[] }>(tokens.access_token, "tools/list");
    const whoami = listed.tools.find((tool) => tool.name === "whoami");
    expect(whoami).toMatchObject({
      annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
      inputSchema: { type: "object" },
      title: "Who am I",
    });
  });

  it("answers whoami with the account, the Telegram id, the scopes and the server time", async () => {
    const { tokens } = await obtainToken({
      scope: "tasks:read tasks:write",
      scopes: ["tasks:read", "tasks:write"],
    });
    const result = await mcpResult<ToolResult>(tokens.access_token, "tools/call", {
      arguments: {},
      name: "whoami",
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      scopes: ["tasks:read", "tasks:write"],
      telegramId: "1001",
    });
    expect(typeof result.structuredContent?.["userId"]).toBe("string");
    expect(new Date(String(result.structuredContent?.["serverTime"])).getTime()).not.toBeNaN();
    const text: unknown = JSON.parse(result.content[0]?.text ?? "{}");
    expect(text).toEqual(result.structuredContent);
  });

  it("refuses a token whose Telegram id is not on the whitelist with 403", async () => {
    // Consent never issues such a grant; mint one through the provider's own helpers, the way
    // a token minted before a whitelist change would look.
    const { clientId } = await registerClient();
    const { challenge, verifier } = await pkce();
    const helpers = getOAuthApi(providerOptions(API_ORIGIN), env);
    const request = await helpers.parseAuthRequest(
      new Request(`${API_ORIGIN}/authorize?${authorizeQuery(clientId, challenge)}`),
    );
    const { redirectTo } = await helpers.completeAuthorization({
      metadata: {},
      props: { telegramId: "4242", userId: "ghost" },
      request,
      scope: ["tasks:read"],
      userId: "ghost",
    });
    const tokens = await exchangeCode({ clientId, code: codeFrom(redirectTo), verifier });

    const response = await mcpCall(tokens.access_token, "tools/list");
    expect(response.status).toBe(403);
    expect(await readJson<{ error: string }>(response)).toMatchObject({ error: "access_denied" });
  });

  it("rejects a garbage bearer with 401", async () => {
    expect((await mcpCall("1001:grant:nope", "tools/list")).status).toBe(401);
  });
});
