import { z } from "zod";

import {
  err,
  type EventInput,
  exampleCoursePresetEvents,
  ok,
  presetById,
  type PresetValidationError,
  validatePresetInput,
} from "@pace/core";

import { WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { describeCode, runWrite, stamp, WRITE_OUTPUT } from "../tool-kit.ts";

const PRESET_ID = z.string().min(1).describe("Lowercase slug, e.g. hw.algebra or work.ops.");

const DEFINITION = z
  .record(z.string(), z.unknown())
  .describe(
    "Only the keys to change: urgencyPolicy (age|lag|pace|resubmission), defaultImportance, deadlinePolicy ({kind:'hard'} or {kind:'resubmission', softDays, finalAt, finalTz}), submission (whole|per_subtask), progressMode (subtasks|slider|none), recurrence ({issued:{weekday,time}, due:{weekday,time}, tz} or null), fields ({ticket,description,startAt,submitVia}), notify ({criticalHours,criticalProgress,criticalScore,waitingDays,inProgressIdleDays}), defaultEstimateMinutes, color.",
  );

const presetFailure = (code: PresetValidationError) => err({ code, message: describeCode(code) });

type PresetCreated = Extract<EventInput, { readonly type: "preset.created" }>;

const isPresetCreated = (event: EventInput): event is PresetCreated =>
  event.type === "preset.created";

const names = (ids: readonly string[]): string => (ids.length === 0 ? "nothing" : ids.join(", "));

export const seedExamplePresets = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description:
    "Creates the three example course presets (hw.algebra, hw.calculus, hw.history: weekly homework schedules extending hw) so the person has something to start from. Presets that already exist are skipped, so calling it again is harmless.",
  handler: async (args, ctx) => {
    const created: string[] = [];
    const skipped: string[] = [];
    return await runWrite(ctx, args, {
      build: (scope, when) => {
        const seeds = exampleCoursePresetEvents(when.at).filter((event) => isPresetCreated(event));
        for (const seed of seeds) {
          const list = presetById(scope.state.presets, seed.payload.id) === undefined ? created : skipped;
          list.push(seed.payload.id);
        }
        return ok(
          seeds
            .filter((seed) => created.includes(seed.payload.id))
            .map((seed) => ({ ...seed, precision: when.precision, source: "mcp" as const })),
        );
      },
      render: () => ({
        structured: { created, skipped },
        summary: `Created ${names(created)}; skipped ${names(skipped)}.`,
      }),
    });
  },
  input: WRITE_INPUT,
  name: "seed_example_presets",
  output: { ...WRITE_OUTPUT, created: z.array(z.string()), skipped: z.array(z.string()) },
  scope: "tasks:write",
  title: "Seed example presets",
});

export const presetCreation = defineTool({
  annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false },
  description:
    "Creates a user preset that extends a built-in (hw, work, personal, deferred) or another user preset; the definition holds only what it changes (a course: a recurrence and maybe a resubmission deadline policy). Validated: unknown keys, cycles and built-in ids are refused with the code.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const checked = validatePresetInput(
          scope.state.presets,
          { definition: args.definition, extends: args.extends, id: args.id, name: args.name },
          "create",
        );
        return checked.ok
          ? ok([
              stamp(when, {
                payload: {
                  definition: args.definition,
                  extends: args.extends,
                  id: args.id,
                  name: args.name,
                },
                type: "preset.created",
              }),
            ])
          : presetFailure(checked.error);
      },
      render: () => ({
        structured: { presetId: args.id },
        summary: `Created preset ${args.id} (${args.name}) extending ${args.extends}.`,
      }),
    }),
  input: {
    ...WRITE_INPUT,
    id: PRESET_ID,
    name: z.string().min(1),
    extends: z.string().min(1).describe("The parent preset id."),
    definition: DEFINITION,
  },
  name: "create_preset",
  output: { ...WRITE_OUTPUT, presetId: z.string() },
  scope: "tasks:write",
  title: "Create preset",
});

export const updatePreset = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description:
    "Changes a user preset's name, parent or definition (a definition replaces the stored one entirely: pass every key the preset should keep). Built-in presets cannot be changed.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const current = presetById(scope.state.presets, args.id);
        if (current === undefined) {
          return presetFailure("preset/unknown");
        }
        const checked = validatePresetInput(
          scope.state.presets,
          {
            definition: args.definition ?? current.definition,
            extends: args.extends ?? current.extends,
            id: args.id,
            name: args.name ?? current.name,
          },
          "update",
        );
        return checked.ok
          ? ok([
              stamp(when, {
                payload: {
                  definition: args.definition,
                  extends: args.extends,
                  id: args.id,
                  name: args.name,
                },
                type: "preset.updated",
              }),
            ])
          : presetFailure(checked.error);
      },
      render: () => ({ structured: { presetId: args.id }, summary: `Updated preset ${args.id}.` }),
    }),
  input: {
    ...WRITE_INPUT,
    id: PRESET_ID,
    name: z.string().min(1).optional(),
    extends: z.string().min(1).optional(),
    definition: DEFINITION.optional(),
  },
  name: "update_preset",
  output: { ...WRITE_OUTPUT, presetId: z.string() },
  scope: "tasks:write",
  title: "Update preset",
});

export const archivePreset = defineTool({
  annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false },
  description:
    "Archives a user preset: no new instances are created and it leaves the pickers, while its existing tasks keep working. Revoke the archiving event to bring it back. Built-ins cannot be archived.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const current = presetById(scope.state.presets, args.id);
        if (current === undefined) {
          return presetFailure("preset/unknown");
        }
        return current.builtIn
          ? presetFailure("preset/built-in")
          : ok([stamp(when, { payload: { id: args.id }, type: "preset.archived" })]);
      },
      render: () => ({ structured: { presetId: args.id }, summary: `Archived preset ${args.id}.` }),
    }),
  input: { ...WRITE_INPUT, id: PRESET_ID },
  name: "archive_preset",
  output: { ...WRITE_OUTPUT, presetId: z.string() },
  scope: "tasks:write",
  title: "Archive preset",
});
