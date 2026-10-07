import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { OAuthScope } from "@pace/core";

import type { McpGrant } from "./grant.ts";

/** The MCP behaviour hints every Pace tool must state (clients show them before calling). */
export type ToolAnnotations = {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
};

export type ToolDefinition<Input extends ZodRawShapeCompat> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The scope a grant must carry for this tool to run. */
  readonly scope: OAuthScope;
  readonly annotations: ToolAnnotations;
  readonly input: Input;
  /** Every tool answers structured data (`structuredContent`) as well as text; this is its shape. */
  readonly output: ZodRawShapeCompat;
  readonly handler: (
    args: ShapeOutput<Input>,
    grant: McpGrant,
  ) => CallToolResult | Promise<CallToolResult>;
};

/** A tool ready to be attached to a server for one grant. */
export type Tool = {
  readonly name: string;
  readonly scope: OAuthScope;
  readonly register: (server: McpServer, grant: McpGrant) => void;
};

/** A tool result the client can show: the grant does not cover this tool. */
const scopeError = (name: string, scope: OAuthScope): CallToolResult => ({
  content: [
    {
      text: `This connection was not granted the "${scope}" scope that ${name} needs. Reconnect Pace and allow it on the consent page.`,
      type: "text",
    },
  ],
  isError: true,
});

/**
 * Declares a tool once: name, docs, the scope it needs, its MCP annotations and a typed
 * handler. Registration wraps the handler with the scope check, so a tool outside the grant
 * answers an MCP error instead of running (or crashing the request).
 */
export const defineTool = <Input extends ZodRawShapeCompat>(
  definition: ToolDefinition<Input>,
): Tool => ({
  name: definition.name,
  register: (server, grant) => {
    const guarded: ToolCallback<Input> = async (args) =>
      grant.scopes.includes(definition.scope)
        ? await definition.handler(args, grant)
        : scopeError(definition.name, definition.scope);
    server.registerTool(
      definition.name,
      {
        annotations: { ...definition.annotations, title: definition.title },
        description: definition.description,
        inputSchema: definition.input,
        outputSchema: definition.output,
        title: definition.title,
      },
      guarded,
    );
  },
  scope: definition.scope,
});

export const registerTools = (server: McpServer, tools: readonly Tool[], grant: McpGrant): void => {
  for (const tool of tools) {
    tool.register(server, grant);
  }
};
