import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { loadConfig } from "../shared/config.ts";
import { createLogger } from "../shared/logger.ts";
import { isAllowed } from "../shared/telegram-identity.ts";
import { type McpGrant, readGrant } from "./grant.ts";
import { registerTools, type Tool } from "./registry.ts";
import { whoami } from "./tools/whoami.ts";

const SERVER_INFO = { name: "pace", version: "0.1.0" };

const INSTRUCTIONS =
  "Pace is a personal task and time tracker. Every tool acts as the person who authorized this connection; tools state the scope they need and whether they change anything.";

/** Every tool the server offers; each one checks its own scope against the grant when called. */
export const TOOLS: readonly Tool[] = [whoami];

/** One server per request: the Worker keeps no MCP session, so the grant is baked in here. */
export const createMcpServer = (grant: McpGrant): McpServer => {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, TOOLS, grant);
  return server;
};

const oauthError = (status: number, error: string, description: string): Response =>
  Response.json({ error, error_description: description }, { status });

/**
 * The protected handler behind `OAuthProvider` (`apiRoute: "/mcp"`): the provider has
 * validated the bearer and attached `ctx.props` (what consent stored) and `ctx.auth` (the
 * token's scopes). Stateless streamable HTTP: every POST is a complete JSON-RPC exchange.
 */
export const mcpHandler = async (
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
): Promise<Response> => {
  const grant = readGrant(ctx);
  if (!grant.ok) {
    return oauthError(401, "invalid_token", "The token carries no usable grant; reconnect Pace");
  }
  const config = loadConfig(env);
  if (!config.ok) {
    createLogger("info").error(config.error);
    return oauthError(500, "server_error", "The server is misconfigured");
  }
  // A person removed from the whitelist keeps no access through tokens minted earlier.
  if (!isAllowed(grant.value.telegramId, config.value.allowedTelegramIds)) {
    return oauthError(403, "access_denied", "This Telegram account is not allowed to use Pace");
  }
  const server = createMcpServer(grant.value);
  // No session id generator = stateless; JSON responses keep the Worker request-shaped.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return await transport.handleRequest(request);
};
