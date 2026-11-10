import {
  byPresetOrder,
  err,
  exampleCoursePresetEvents,
  isExampleToSeed,
  parsePresetDefinition,
  presetById,
  type PresetInput,
  type PresetInputMode,
  storedPresetName,
  validatePresetInput,
} from "@pace/core";

import { type ActionDeps, type ActionResult, emit, fromStoreAll, stamp } from "./deps.ts";

export type PresetActions = {
  readonly createPreset: (input: PresetInput) => ActionResult;
  readonly updatePreset: (input: PresetInput) => ActionResult;
  readonly archivePreset: (presetId: string) => ActionResult;
  /** Brings a deleted preset back: the archive event is revoked (a correction, never an edit). */
  readonly restorePreset: (presetId: string) => ActionResult;
  /** One place up (`-1`) or down (`1`) in the pickers. */
  readonly movePreset: (presetId: string, step: -1 | 1) => ActionResult;
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
  const { id, order } = input;
  // A default given back its label in the editor's language keeps its shipped name (R23-06).
  const name = storedPresetName(id, input.name);
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
    // Asked again in the write queue: two presses at once write one archive (class 222).
    const isArchived = (): boolean =>
      presetById(deps.state.store.getState().presets, presetId)?.archived === true;
    return isArchived()
      ? err("action/nothing-to-do")
      : await emit(
          deps,
          [stamp(deps, { type: "preset.archived", payload: { id: presetId } })],
          () => (isArchived() ? "action/nothing-to-do" : null),
        );
  };

const restorePreset =
  (deps: ActionDeps): PresetActions["restorePreset"] =>
  async (presetId) => {
    const { events, presets } = deps.state.store.getState();
    const preset = presetById(presets, presetId);
    if (preset === undefined) {
      return err("preset/unknown");
    }
    if (!preset.archived) {
      return err("action/nothing-to-do");
    }
    // Every archive in effect, in one batch: two devices may have archived it offline (review M1).
    const archives = events.filter(
      (event) => event.type === "preset.archived" && event.payload.id === presetId,
    );
    return archives.length === 0
      ? err("action/nothing-to-do")
      : fromStoreAll(await deps.state.revokeAll(archives.map((event) => event.id)));
  };

/**
The pickers' order as positions 1…n: new presets share order 100 until one is moved, so
the whole list is renumbered and only the presets whose number changes get an event.
*/
const movePreset =
  (deps: ActionDeps): PresetActions["movePreset"] =>
  async (presetId, step) => {
    const sorted = Object.values(deps.state.store.getState().presets.byId)
      .filter((preset) => preset.id !== "inbox")
      .toSorted(byPresetOrder);
    const from = sorted.findIndex((preset) => preset.id === presetId);
    if (from === -1) {
      return err("preset/unknown");
    }
    const to = from + step;
    const other = sorted[to];
    const moving = sorted[from];
    if (other === undefined || moving === undefined) {
      return err("action/nothing-to-do");
    }
    const next = sorted.with(from, other).with(to, moving);
    return await emit(
      deps,
      next.flatMap((preset, index) =>
        preset.order === index + 1
          ? []
          : [stamp(deps, { type: "preset.updated", payload: { id: preset.id, order: index + 1 } })],
      ),
    );
  };

export const presetActions = (deps: ActionDeps): PresetActions => ({
  archivePreset: archivePreset(deps),
  restorePreset: restorePreset(deps),
  movePreset: movePreset(deps),
  createPreset: async (input) => await savePreset(deps, input, "create"),
  seedExamplePresets: async () => {
    const { presets, settings } = deps.state.store.getState();
    const missing = exampleCoursePresetEvents(deps.clock.now(), settings.language).filter((input) =>
      isExampleToSeed(presets, input),
    );
    return await emit(
      deps,
      missing.map((input) => ({ ...input, source: deps.source })),
    );
  },
  updatePreset: async (input) => await savePreset(deps, input, "update"),
});
