import { z } from "zod";

import {
  accountTz,
  addDaysIn,
  effectiveButtons,
  ok,
  startOfDayIn,
  timeByCategory,
  timeByProject,
  timeline,
} from "@pace/core";

import { defineTool } from "../registry.ts";
import { runRead } from "../tool-kit.ts";

const READ = { destructiveHint: false, idempotentHint: true, readOnlyHint: true };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

const ROW = z.record(z.string(), z.unknown());

/** The time bar's buttons: what one call to start_activity with a buttonId starts. */
export const listActivityButtons = defineTool({
  annotations: READ,
  description:
    "Lists the time bar's activity buttons in their order: id, label, category, Expect and Limit minutes and the linked task. Pass an id to start_activity to start that activity with its defaults.",
  handler: async (_args, ctx) =>
    await runRead(ctx, ({ state }) => {
      const buttons = effectiveButtons(state.time).map((button) => ({
        category: button.category,
        expectMinutes: button.expectMinutes,
        id: button.id,
        label: button.label,
        limitMinutes: button.limitMinutes,
        taskId: button.taskId,
      }));
      return ok({
        structured: { buttons },
        summary: buttons
          .map((button) => `- ${button.id}: ${button.label} (${button.category})`)
          .join("\n"),
      });
    }),
  input: {},
  name: "list_activity_buttons",
  output: { buttons: z.array(ROW) },
  scope: "time:read",
  title: "List activity buttons",
});

/** One day of the ledger in the account zone: blocks, gaps, totals. */
export const dayTool = defineTool({
  annotations: READ,
  description:
    "Returns one day of tracked time in the account's time zone: the blocks in order (label, category, start, end, minutes, linked task), the gaps of 15 minutes or more nothing covers, minutes per category, and what is running. date is YYYY-MM-DD (default today).",
  handler: async (args, ctx) =>
    await runRead(ctx, ({ qctx, state }) => {
      const zone = accountTz(state, qctx);
      const anchor = args.date === undefined ? qctx.now : `${args.date}T12:00:00.000Z`;
      const from = startOfDayIn(anchor, zone);
      const day = timeline(state.time, { from, now: qctx.now, to: addDaysIn(from, 1, zone) });
      return ok({
        structured: {
          from,
          gaps: [...day.gaps],
          running: day.running,
          segments: [...day.segments],
          totals: day.totals,
          trackedMinutes: day.trackedMinutes,
          zone,
        },
        summary:
          day.segments.length === 0
            ? "Nothing tracked on this day."
            : day.segments
                .map(
                  (segment) =>
                    `- ${segment.startAt}–${segment.endAt} ${segment.label} (${segment.category}, ${String(segment.minutes)}m)`,
                )
                .join("\n"),
      });
    }),
  input: {
    date: z
      .string()
      .regex(DATE)
      .optional()
      .describe("YYYY-MM-DD in the account zone; default today."),
  },
  name: "get_day",
  output: {
    from: z.string(),
    gaps: z.array(z.unknown()),
    running: z.unknown(),
    segments: z.array(z.unknown()),
    totals: z.record(z.string(), z.number()),
    trackedMinutes: z.number(),
    zone: z.string(),
  },
  scope: "time:read",
  title: "Get day",
});

/** Where the time went over a range: by category and by project. */
export const summaryTime = defineTool({
  annotations: READ,
  description:
    "Sums tracked time over a range (from..to, ISO 8601 UTC): minutes per category and per project (through the task the time was spent on; null = no project), largest first.",
  handler: async (args, ctx) =>
    await runRead(ctx, ({ qctx, state }) => {
      const range = { from: args.from, now: qctx.now, to: args.to };
      const byCategory = timeByCategory(state, range);
      const byProject = timeByProject(state, range).map((row) => ({
        ...row,
        name: row.projectId === null ? null : (state.projects.byId[row.projectId]?.name ?? null),
      }));
      return ok({
        structured: { byCategory: [...byCategory], byProject },
        summary:
          byCategory.length === 0
            ? "Nothing tracked."
            : byCategory.map((row) => `- ${row.category}: ${String(row.minutes)}m`).join("\n"),
      });
    }),
  input: { from: z.iso.datetime(), to: z.iso.datetime() },
  name: "summary_time",
  output: { byCategory: z.array(z.unknown()), byProject: z.array(z.unknown()) },
  scope: "time:read",
  title: "Time summary",
});
