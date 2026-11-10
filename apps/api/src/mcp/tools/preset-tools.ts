import { z } from "zod";

import {
  err,
  type EventInput,
  exampleCoursePresetEvents,
  isExampleToSeed,
  ok,
  parsePresetDefinition,
  type Preset,
  presetById,
  type PresetValidationError,
  type Result,
  storedPresetName,
  validatePresetInput,
} from "@pace/core";

import { WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import {
  type Build,
  describeCode,
  runWrite,
  type Scope,
  stamp,
  type TargetBuild,
  type ToolFailure,
  withTarget,
  WRITE_OUTPUT,
} from "../tool-kit.ts";

/** How a weekly recurrence reads, written for the tool descriptions (feedback 5). */
const RECURRENCE_RULES =
  "Recurrence: weekday is 1-7 (1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday) or an English name ('wed' or 'Wednesday', any case; stored as the number); time is HH:MM in tz (IANA zone). The due slot falls in the issue's week when it is later in that week, else in the next week. Each instance is a task titled '<preset name> <n>': n = firstNumber (a whole number, default 1) plus the number of instances of this preset already in the store, closed ones included (one made and then revoked is not counted), so instances count up from firstNumber in issue order; changing firstNumber later moves the numbers of the instances still to come. An instance is issued at its week's issue moment; a preset created (or given its recurrence) after this week's issue moment issues this week's instance at once, unless its deadline had already passed, and then next week's instance waits ahead under 'In future'. An unknown key or a bad value is refused as preset/invalid-definition with the key path and the reason.";

const PRESET_ID = z.string().min(1).describe("Lowercase slug, e.g. hw.algebra or work.ops.");

const DEFINITION = z
  .record(z.string(), z.unknown())
  .describe(
    "Only the keys to change: urgencyPolicy (age|lag|pace|resubmission), defaultImportance, deadlinePolicy ({kind:'hard'} or {kind:'resubmission', softDays, finalAt, finalTz}), progressMode (subtasks|slider|none), recurrence ({issued:{weekday,time}, due:{weekday,time}, tz, firstNumber?} or null; see the tool description), fields ({link,description,startAt,submitVia}), defaultEstimateMinutes, color.",
  );

/** A refusal; an invalid definition says which key and why (`recurrence.due.weekday: …`). */
const presetFailure = (code: PresetValidationError, definition?: unknown) => {
  const parsed = code === "preset/invalid-definition" ? parsePresetDefinition(definition) : null;
  const reason = parsed === null || parsed.ok ? "" : ` ${parsed.error}`;
  return err({ code, message: `${describeCode(code)}${reason}` });
};

/** The definition as stored: weekday names become their numbers (old clients read numbers). */
const storedDefinition = (
  definition: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const parsed = parsePresetDefinition(definition);
  return parsed.ok ? parsed.value : definition;
};

const existingPreset = (scope: Scope, id: string): Result<Preset, ToolFailure> => {
  const preset = presetById(scope.state.presets, id);
  return preset === undefined ? presetFailure("preset/unknown") : ok(preset);
};

/** The build of a write about one existing preset (archived ones included). */
const forPreset = (id: string, build: TargetBuild<Preset>): Build =>
  withTarget((scope) => existingPreset(scope, id), build);

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
        // Named in the account's language (QA round 23 R23-06).
        const seeds = exampleCoursePresetEvents(when.at, scope.state.settings.language).filter(
          (event) => isPresetCreated(event),
        );
        for (const seed of seeds) {
          // Skipped: an example already there, or one whose name a preset goes by (review M6).
          const list = isExampleToSeed(scope.state.presets, seed) ? created : skipped;
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
  description: `Creates a user preset that extends a built-in (hw, work, personal, deferred) or another user preset; the definition holds only what it changes (a course: a recurrence and maybe a resubmission deadline policy). Validated: unknown keys, cycles and built-in ids are refused with the code. ${RECURRENCE_RULES}`,
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
                  definition: storedDefinition(args.definition),
                  extends: args.extends,
                  id: args.id,
                  name: args.name,
                },
                type: "preset.created",
              }),
            ])
          : presetFailure(checked.error, args.definition);
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
  description: `Changes a preset's name, parent or definition (a definition replaces the stored one entirely: pass every key the preset should keep). The default presets (hw, work, personal, deferred, inbox) can be edited too, but keep no parent: their definition is read on top of their shipped values. ${RECURRENCE_RULES}`,
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forPreset(args.id, (scope, when, current) => {
        const definition = args.definition ?? current.definition;
        const checked = validatePresetInput(
          scope.state.presets,
          {
            definition,
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
                  definition:
                    args.definition === undefined ? undefined : storedDefinition(args.definition),
                  extends: args.extends,
                  id: args.id,
                  name: args.name === undefined ? undefined : storedPresetName(args.id, args.name),
                },
                type: "preset.updated",
              }),
            ])
          : presetFailure(checked.error, definition);
      }),
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
    "Archives (deletes) a preset: no new instances are created and it leaves the pickers, while its existing tasks keep working. Revoke the archiving event to bring it back. Any preset but the inbox can be archived, the defaults included.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forPreset(args.id, (_scope, when, current) =>
        current.id === "inbox"
          ? presetFailure("preset/built-in")
          : ok([stamp(when, { payload: { id: args.id }, type: "preset.archived" })]),
      ),
      render: () => ({ structured: { presetId: args.id }, summary: `Archived preset ${args.id}.` }),
    }),
  input: { ...WRITE_INPUT, id: PRESET_ID },
  name: "archive_preset",
  output: { ...WRITE_OUTPUT, presetId: z.string() },
  scope: "tasks:write",
  title: "Archive preset",
});
