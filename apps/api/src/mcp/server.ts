import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { loadConfig } from "../shared/config.ts";
import { createLogger } from "../shared/logger.ts";
import { isAllowed } from "../shared/telegram-identity.ts";
import { readGrant } from "./grant.ts";
import { registerTools, type Tool, type ToolContext } from "./registry.ts";
import { describeSchema, exportAll, querySql, simulateTool } from "./tools/analytics-tools.ts";
import { reviewAction, revokeEvent } from "./tools/correction-tools.ts";
import { searchDecisions } from "./tools/decision-tools.ts";
import { importanceTool, rankTool, statusTool, subtasksTool } from "./tools/edit-tools.ts";
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
  "Time tools: list_activity_buttons, get_day and summary_time (time:read); start_activity, stop_activity and log_activity (time:write).",
  "Analytics (analytics:read): describe_schema, query_sql (one read-only SELECT over the store's tables), simulate (replay the reminder rules over a past range; rank Now with other importance weights) and export_all (the event log as NDJSON).",
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
  rankTool,
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
