import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { UserStoreApi } from "../shared/contract.ts";

import { defineTool, registerTools, type ToolContext } from "./registry.ts";

const renameTask = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description: "Renames a task (test double).",
  handler: ({ title }, ctx) => ({
    content: [{ text: `${ctx.grant.userId} renamed to ${title}`, type: "text" }],
    structuredContent: { by: ctx.grant.userId, title },
  }),
  input: { title: z.string().min(1) },
  name: "rename_task",
  output: { by: z.string(), title: z.string() },
  scope: "tasks:write",
  title: "Rename task",
});

/** The registry never touches the store itself; a tool that did would fail loudly here. */
const untouchedStore: UserStoreApi = {
  apply: async () => {
    throw new Error("store not expected");
  },
  dryRun: async () => {
    throw new Error("store not expected");
  },
  find: async () => {
    throw new Error("store not expected");
  },
  read: async () => {
    throw new Error("store not expected");
  },
};

const context = (scopes: readonly string[]): ToolContext => ({
  grant: { scopes, telegramId: "1001", userId: "user-1" },
  now: "2026-10-07T10:00:00.000Z",
  store: untouchedStore,
  webOrigin: "https://pace.test",
});

/** A client wired to a fresh server over the in-memory transport pair. */
const connect = async (scopes: readonly string[]): Promise<Client> => {
  const server = new McpServer({ name: "test", version: "0" });
  registerTools(server, [renameTask], context(scopes));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test-client", version: "0" });
  await client.connect(clientSide);
  return client;
};

/** The SDK's client result is loosely typed; parse it into the protocol shape. */
const callRename = async (client: Client) =>
  CallToolResultSchema.parse(
    await client.callTool({ arguments: { title: "New" }, name: "rename_task" }),
  );

describe("tool registry", () => {
  it("runs the tool with the parsed input and the context when its scope is granted", async () => {
    const client = await connect(["tasks:read", "tasks:write"]);
    const result = await callRename(client);
    expect(result).toMatchObject({
      content: [{ text: "user-1 renamed to New", type: "text" }],
      structuredContent: { by: "user-1", title: "New" },
    });
    expect(result.isError).toBeUndefined();
  });

  it("answers a tool error, not a crash, when the grant lacks the scope", async () => {
    const client = await connect(["tasks:read"]);
    const result = await callRename(client);
    expect(result.isError).toBe(true);
    const [first] = result.content;
    expect(first?.type).toBe("text");
    expect(first?.type === "text" ? first.text : "").toContain('"tasks:write"');
  });

  it("publishes the title and the MCP annotations", async () => {
    const client = await connect([]);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
      description: "Renames a task (test double).",
      name: "rename_task",
      title: "Rename task",
    });
  });
});
