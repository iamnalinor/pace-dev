import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { loadConfig } from "../shared/config.ts";
import { createLogger } from "../shared/logger.ts";
import { isAllowed } from "../shared/telegram-identity.ts";
import { telegramIdOf } from "../shared/user-lookup.ts";
import { type McpGrant, readGrant } from "./grant.ts";
import { registerTools, type Tool, type ToolContext } from "./registry.ts";
import { describeSchema, exportAll, querySql, simulateTool } from "./tools/analytics-tools.ts";
import { calendarTool, usageTool, weekTool } from "./tools/cloud-tools.ts";
import { reviewAction, revokeEvent } from "./tools/correction-tools.ts";
import { searchDecisions } from "./tools/decision-tools.ts";
import { importanceTool, statusTool, subtasksTool } from "./tools/edit-tools.ts";
import { taskTool } from "./tools/get-task.ts";
import {
  listInbox,
  listNow,
  listPresets,
  listProjects,
  listProjectTasks,
  listReview,
} from "./tools/list-tools.ts";
import {
  archivePreset,
  presetCreation,
  seedExamplePresets,
  updatePreset,
} from "./tools/preset-tools.ts";
import { closeTask, markSubtasks, reopen, submit } from "./tools/progress-tools.ts";
import { fetchDocument, search } from "./tools/search-tools.ts";
import { captureInbox, taskCreation, updateTask } from "./tools/task-tools.ts";
import { dayTool, listActivityButtons, summaryTime } from "./tools/time-read-tools.ts";
import { logActivity, startActivity, stopActivity } from "./tools/time-write-tools.ts";
import { whoami } from "./tools/whoami.ts";

const SERVER_INFO = { name: "pace", version: "0.1.0" };

const INSTRUCTIONS = [
  "Pace is a personal task and time tracker. Every tool acts as the person who authorized this connection.",
  "Read tools (tasks:read): whoami, list_now, get_task, list_projects, list_project_tasks, list_presets, list_inbox, list_review, search, fetch, search_decisions (why a reminder was or was not sent).",
  "Time tools: list_activity_buttons, get_day, summary_time, get_calendar, get_usage and get_week (time:read); start_activity, stop_activity and log_activity (time:write).",
  "Analytics (analytics:read): describe_schema, query_sql (one read-only SELECT over the store's tables), simulate (replay the reminder rules over a past range) and export_all (the event log as NDJSON).",
  "Mutating tools (tasks:write, time:write) take `at` (ISO instant, default now; use the past to record retroactively), `precision` (exact|approx) and `dryRun` (true = validate and preview the events, write nothing).",
  "Ids are opaque strings; find them with list_now, search or get_task. Times are ISO 8601 UTC; deadlines carry the IANA zone they were set in.",
  "A refusal is a tool error whose text starts with a code such as task/unknown, retro/task-closed or preset/exists.",
].join(" ");

/** Every tool the server offers; each one checks its own scope against the grant when called. */
export const TOOLS: readonly Tool[] = [
  whoami,
  listNow,
  taskTool,
  listProjects,
  listProjectTasks,
  listPresets,
  listInbox,
  listReview,
  search,
  fetchDocument,
  searchDecisions,
  taskCreation,
  captureInbox,
  markSubtasks,
  submit,
  closeTask,
  reopen,
  updateTask,
  importanceTool,
  statusTool,
  subtasksTool,
  revokeEvent,
  reviewAction,
  seedExamplePresets,
  presetCreation,
  updatePreset,
  archivePreset,
  listActivityButtons,
  dayTool,
  summaryTime,
  calendarTool,
  usageTool,
  weekTool,
  startActivity,
  stopActivity,
  logActivity,
  describeSchema,
  querySql,
  simulateTool,
  exportAll,
];

/** One server per request: the Worker keeps no MCP session, so the context is baked in here. */
export const createMcpServer = (ctx: ToolContext): McpServer => {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, TOOLS, ctx);
  return server;
};

const oauthError = (status: number, error: string, description: string): Response =>
  Response.json({ error, error_description: description }, { status });

/**
A token that no longer stands for anyone: `401 invalid_token` with the Bearer challenge the
OAuth provider itself sends, so the client drops the token and connects again.
*/
const invalidToken = (request: Request, description: string): Response => {
  const response = oauthError(401, "invalid_token", description);
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp", request.url).href;
  response.headers.set(
    "WWW-Authenticate",
    `Bearer realm="OAuth", error="invalid_token", error_description="${description}", resource_metadata="${metadata}"`,
  );
  return response;
};

/**
Why a valid token may still not reach the store, as the OAuth error response; `null` when it
may. A person removed from the whitelist keeps no access through tokens minted earlier, and
a grant outlives its user (a deleted account, a data reset that gave everyone new ids): its
store would belong to nobody, so the client is sent to connect again instead.
*/
const refusal = async (access: {
  readonly allowed: readonly string[];
  readonly db: D1Database;
  readonly grant: McpGrant;
  readonly request: Request;
}): Promise<null | Response> => {
  if (!isAllowed(access.grant.telegramId, access.allowed)) {
    return oauthError(403, "access_denied", "This Telegram account is not allowed to use Pace");
  }
  return (await telegramIdOf(access.db, access.grant.userId)) === undefined
    ? invalidToken(access.request, "The account behind this token no longer exists; reconnect Pace")
    : null;
};

/**
The protected handler behind `OAuthProvider` (`apiRoute: "/mcp"`): the provider has
validated the bearer and attached `ctx.props` (what consent stored) and `ctx.auth` (the
token's scopes). Stateless streamable HTTP: every POST is a complete JSON-RPC exchange.
*/
export const mcpHandler = async (
  request: Request,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
): Promise<Response> => {
  const grant = readGrant(ctx);
  if (!grant.ok) {
    return invalidToken(request, "The token carries no usable grant; reconnect Pace");
  }
  const config = loadConfig(env);
  if (!config.ok) {
    createLogger("info").error(config.error);
    return oauthError(500, "server_error", "The server is misconfigured");
  }
  const refused = await refusal({
    allowed: config.value.allowedTelegramIds,
    db: env.DB,
    grant: grant.value,
    request,
  });
  if (refused !== null) {
    return refused;
  }
  // The same Durable Object the sync routes use: one per user, named by the user id.
  const store = env.USER_STORE.get(env.USER_STORE.idFromName(grant.value.userId));
  const server = createMcpServer({
    grant: grant.value,
    now: new Date().toISOString(),
    store,
    webOrigin: config.value.webOrigin,
  });
  // No session id generator = stateless; JSON responses keep the Worker request-shaped.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return await transport.handleRequest(request);
};
