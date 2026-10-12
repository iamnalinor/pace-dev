import { z } from "zod";

import { timeline, whereSat } from "@pace/core";

import { defineTool } from "../registry.ts";
import { success } from "../tool-kit.ts";

const READ = { destructiveHint: false, idempotentHint: true, readOnlyHint: true };

const RANGE = {
  from: z.iso.datetime().describe("Start of the range, ISO 8601 UTC."),
  to: z.iso.datetime().describe("End of the range (exclusive), ISO 8601 UTC."),
};

/** The calendar copy the phone sends (own and accepted events only). */
export const calendarTool = defineTool({
  annotations: READ,
  description:
    "Returns the person's calendar events overlapping a range (from..to, ISO 8601 UTC), as their phone sends them: their own events and subscriptions, and invitations they accepted. Empty when the phone does not send its calendar.",
  handler: async (args, ctx) => {
    const events = await ctx.store.calendar(args);
    return success(
      { events: [...events] },
      events.length === 0
        ? "No calendar events in this range."
        : events.map((event) => `- ${event.startAt}–${event.endAt} ${event.title}`).join("\n"),
    );
  },
  input: RANGE,
  name: "get_calendar",
  output: { events: z.array(z.unknown()) },
  scope: "time:read",
  title: "Get calendar",
});

/** Apps in front on every device: names and times only. */
export const usageTool = defineTool({
  annotations: READ,
  description:
    "Returns app sessions on the person's devices overlapping a range (from..to, ISO 8601 UTC): device, app name, start and end. Only names and times are kept, never window titles or contents. `device` narrows to one device by its name.",
  handler: async (args, ctx) => {
    const all = await ctx.store.usage({ from: args.from, to: args.to });
    const sessions = all.filter(
      (session) => args.device === undefined || session.deviceName === args.device,
    );
    return success(
      { sessions: [...sessions] },
      sessions.length === 0
        ? "No app usage in this range."
        : `${String(sessions.length)} sessions on ${[...new Set(sessions.map((s) => s.deviceName))].join(", ")}.`,
    );
  },
  input: { ...RANGE, device: z.string().trim().min(1).max(80).optional() },
  name: "get_usage",
  output: { sessions: z.array(z.unknown()) },
  scope: "time:read",
  title: "Get app usage",
});

/** "- 2026-10-06T10:00 Algebra (45m): code 40m, firefox 5m" */
const blockLine = (block: {
  readonly startAt: string;
  readonly label: string;
  readonly minutes: number;
  readonly sat: readonly { readonly app: string; readonly minutes: number }[];
}): string => {
  const top = block.sat.slice(0, 3).map((row) => `${row.app} ${String(row.minutes)}m`);
  const where = top.length === 0 ? "" : `: ${top.join(", ")}`;
  return `- ${block.startAt} ${block.label} (${String(block.minutes)}m)${where}`;
};

/** A week (or any range) in one call: tracked blocks with where the time went, and the calendar. */
export const weekTool = defineTool({
  annotations: READ,
  description:
    "Returns a range (from..to, ISO 8601 UTC; a week is typical) as the person lived it: the tracked blocks in order (label, category, start, end, minutes), each with `sat` — the apps in front on each device during it, largest first — what ran alongside, and the calendar's events. Nothing is judged: it only shows where the time went.",
  handler: async (args, ctx) => {
    const { state } = await ctx.store.read(ctx.now);
    const usage = await ctx.store.usage(args);
    const calendar = await ctx.store.calendar(args);
    const range = timeline(state.time, { ...args, now: ctx.now });
    const withSat = (segment: (typeof range.segments)[number]) => ({
      ...segment,
      sat: whereSat(segment, usage),
    });
    const blocks = range.segments.map((segment) => withSat(segment));
    return success(
      {
        alongside: range.alongside.map((segment) => withSat(segment)),
        blocks,
        calendar: [...calendar],
      },
      blocks.length === 0
        ? "Nothing tracked in this range."
        : blocks.map((block) => blockLine(block)).join("\n"),
    );
  },
  input: RANGE,
  name: "get_week",
  output: {
    alongside: z.array(z.unknown()),
    blocks: z.array(z.unknown()),
    calendar: z.array(z.unknown()),
  },
  scope: "time:read",
  title: "Get week",
});
