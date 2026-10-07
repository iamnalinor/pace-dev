import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

/** What a bearer token proves about the caller: set at consent, read on every MCP request. */
export type McpGrant = {
  readonly userId: string;
  readonly telegramId: string;
  readonly scopes: readonly string[];
};

/** The props `completeAuthorization` stored in the token (see oauth/oauth-routes.ts). */
const McpPropsSchema = z.object({
  userId: z.string().min(1),
  telegramId: z.string().min(1),
});

/** The part of the provider's `ctx.auth` the MCP server needs: the token's scopes. */
const AuthSchema = z.object({ scope: z.array(z.string()) });

const authOf = (ctx: ExecutionContext): unknown => ("auth" in ctx ? ctx.auth : undefined);

/**
 * Reads the grant the OAuth provider attached to the execution context. A token minted
 * before a props change (or by something else entirely) fails here instead of deep inside
 * a tool.
 */
export const readGrant = (ctx: ExecutionContext): Result<McpGrant, "mcp/invalid-grant"> => {
  const props = McpPropsSchema.safeParse(ctx.props);
  const auth = AuthSchema.safeParse(authOf(ctx));
  if (!props.success || !auth.success) {
    return err("mcp/invalid-grant");
  }
  return ok({
    scopes: auth.data.scope,
    telegramId: props.data.telegramId,
    userId: props.data.userId,
  });
};
