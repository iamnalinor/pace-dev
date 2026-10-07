import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { McpGrant } from "./grant.ts";

import { defineTool, registerTools } from "./registry.ts";

const renameTask = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description: "Renames a task (test double).",
  handler: ({ title }, grant) => ({
    content: [{ text: `${grant.userId} renamed to ${title}`, type: "text" }],
    structuredContent: { by: grant.userId, title },
  }),
  input: { title: z.string().min(1) },
  name: "rename_task",
  output: { by: z.string(), title: z.string() },
  scope: "tasks:write",
  title: "Rename task",
});

const grant = (scopes: readonly string[]): McpGrant => ({
  scopes,
  telegramId: "1001",
  userId: "user-1",
});

/** A client wired to a fresh server over the in-memory transport pair. */
const connect = async (scopes: readonly string[]): Promise<Client> => {
  const server = new McpServer({ name: "test", version: "0" });
  registerTools(server, [renameTask], grant(scopes));
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
  it("runs the tool with the parsed input and the grant when its scope is granted", async () => {
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
