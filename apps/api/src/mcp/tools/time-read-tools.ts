import { z } from "zod";

import {
  accountTz,
  addDaysIn,
  ok,
  startOfDayIn,
  t,
  TIME_BUTTONS,
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
    "Lists what the time bar's four buttons start (From calendar aside): each choice's id, the button it sits under, its label in the account language, category and Expect minutes. Pass an id to start_activity to start that activity.",
  handler: async (_args, ctx) =>
    await runRead(ctx, ({ state }) => {
      const { language } = state.settings;
      const buttons = TIME_BUTTONS.flatMap((button) =>
        button.choices.map((choice) => ({
          button: button.id,
          category: choice.category,
          expectMinutes: choice.expectMinutes,
          id: choice.id,
          label: t(language, choice.labelKey ?? button.labelKey),
        })),
      );
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
    "Returns one day of tracked time in the account's time zone: the blocks in order (label, category, start, end, minutes, linked task), the gaps of 15 minutes or more nothing covers, minutes per category, what is running, and what ran alongside the main line (not in the totals). date is YYYY-MM-DD (default today).",
  handler: async (args, ctx) =>
    await runRead(ctx, ({ qctx, state }) => {
      const zone = accountTz(state, qctx);
      const anchor = args.date === undefined ? qctx.now : `${args.date}T12:00:00.000Z`;
      const from = startOfDayIn(anchor, zone);
      const day = timeline(state.time, { from, now: qctx.now, to: addDaysIn(from, 1, zone) });
      return ok({
        structured: {
          alongside: [...day.alongside],
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
    alongside: z.array(z.unknown()),
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
