import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import type { OAuthScope } from "@pace/core";

import type { UserStoreApi } from "../shared/contract.ts";
import type { McpGrant } from "./grant.ts";

/** The MCP behaviour hints every Pace tool must state (clients show them before calling). */
export type ToolAnnotations = {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
};

/** What a tool call runs with: the grant behind the token and the caller's user store. */
export type ToolContext = {
  readonly grant: McpGrant;
  readonly store: UserStoreApi;
  /** The web app's origin: links in search results and documents point there. */
  readonly webOrigin: string;
  /** Server time at the start of the request (ISO 8601, UTC). */
  readonly now: string;
};

export type ToolDefinition<Input extends z.ZodRawShape> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The scope a grant must carry for this tool to run. */
  readonly scope: OAuthScope;
  readonly annotations: ToolAnnotations;
  readonly input: Input;
  /** Every tool answers structured data (`structuredContent`) as well as text; this is its shape. */
  readonly output: z.ZodRawShape;
  readonly handler: (
    args: z.output<z.ZodObject<Input>>,
    ctx: ToolContext,
  ) => CallToolResult | Promise<CallToolResult>;
};

/** A tool ready to be attached to a server for one grant. */
export type Tool = {
  readonly name: string;
  readonly scope: OAuthScope;
  readonly register: (server: McpServer, ctx: ToolContext) => void;
};

const toolError = (text: string): CallToolResult => ({
  content: [{ text, type: "text" }],
  isError: true,
});

/** A tool result the client can show: the grant does not cover this tool. */
const scopeError = (name: string, scope: OAuthScope): CallToolResult =>
  toolError(
    `This connection was not granted the "${scope}" scope that ${name} needs. Reconnect Pace and allow it on the consent page.`,
  );

/**
Declares a tool once: name, docs, the scope it needs, its MCP annotations and a typed
handler. Registration wraps the handler with the scope check, so a tool outside the grant
answers an MCP error instead of running (or crashing the request).
*/
export const defineTool = <Input extends z.ZodRawShape>(
  definition: ToolDefinition<Input>,
): Tool => {
  // The SDK validates the arguments against the same shape and hands over plain data; parsing
  // them once more is what gives the handler its typed view without a cast.
  const schema = z.object(definition.input);
  const run = async (raw: unknown, ctx: ToolContext): Promise<CallToolResult> => {
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? await definition.handler(parsed.data, ctx)
      : toolError(`Invalid arguments for ${definition.name}: ${parsed.error.message}`);
  };
  // Widened on purpose: the SDK's callback type is only concrete for a non-generic shape.
  const inputSchema: ZodRawShapeCompat = definition.input;
  return {
    name: definition.name,
    register: (server, ctx) => {
      server.registerTool(
        definition.name,
        {
          annotations: { ...definition.annotations, title: definition.title },
          description: definition.description,
          inputSchema,
          outputSchema: definition.output,
          title: definition.title,
        },
        async (args) =>
          ctx.grant.scopes.includes(definition.scope)
            ? await run(args, ctx)
            : scopeError(definition.name, definition.scope),
      );
    },
    scope: definition.scope,
  };
};

export const registerTools = (
  server: McpServer,
  tools: readonly Tool[],
  ctx: ToolContext,
): void => {
  for (const tool of tools) {
    tool.register(server, ctx);
  }
};
