import {
  err,
  exampleCoursePresetEvents,
  parsePresetDefinition,
  presetById,
  type PresetInput,
  type PresetInputMode,
  validatePresetInput,
} from "@pace/core";

import { type ActionDeps, type ActionResult, emit, stamp } from "./deps.ts";

export type PresetActions = {
  readonly createPreset: (input: PresetInput) => ActionResult;
  readonly updatePreset: (input: PresetInput) => ActionResult;
  readonly archivePreset: (presetId: string) => ActionResult;
  /** The one-click seed of the example course presets; ids already present are left alone. */
  readonly seedExamplePresets: () => ActionResult;
};

const savePreset = async (
  deps: ActionDeps,
  input: PresetInput,
  mode: PresetInputMode,
): ActionResult => {
  const checked = validatePresetInput(deps.state.store.getState().presets, input, mode);
  if (!checked.ok) {
    return checked;
  }
  const definition = parsePresetDefinition(input.definition);
  if (!definition.ok) {
    return err("preset/invalid-definition");
  }
  const { id, name, order } = input;
  const parent = input.extends;
  return await emit(deps, [
    stamp(
      deps,
      mode === "create"
        ? {
            type: "preset.created",
            payload: {
              id,
              name,
              ...(parent !== null && { extends: parent }),
              definition: definition.value,
              ...(order !== undefined && { order }),
            },
          }
        : {
            type: "preset.updated",
            payload: {
              id,
              name,
              extends: parent,
              definition: definition.value,
              ...(order !== undefined && { order }),
            },
          },
    ),
  ]);
};

const archivePreset =
  (deps: ActionDeps): PresetActions["archivePreset"] =>
  async (presetId) => {
    const preset = presetById(deps.state.store.getState().presets, presetId);
    if (preset === undefined) {
      return err("preset/unknown");
    }
    if (preset.id === "inbox") {
      return err("preset/built-in");
    }
    return preset.archived
      ? err("action/nothing-to-do")
      : await emit(deps, [stamp(deps, { type: "preset.archived", payload: { id: presetId } })]);
  };

export const presetActions = (deps: ActionDeps): PresetActions => ({
  archivePreset: archivePreset(deps),
  createPreset: async (input) => await savePreset(deps, input, "create"),
  seedExamplePresets: async () => {
    const { presets } = deps.state.store.getState();
    const missing = exampleCoursePresetEvents(deps.clock.now()).filter(
      (input) =>
        input.type === "preset.created" && presetById(presets, input.payload.id) === undefined,
    );
    return await emit(
      deps,
      missing.map((input) => ({ ...input, source: deps.source })),
    );
  },
  updatePreset: async (input) => await savePreset(deps, input, "update"),
});
