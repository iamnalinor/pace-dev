import type { EventOf } from "../events/event-schema.ts";
import type { Reducer } from "../materialize/materializer.ts";
import type { Preset, PresetDefinition } from "../model/preset.ts";

import { ok } from "../result.ts";
import { BASE_PRESETS, isBuiltInPreset } from "./base-presets.ts";
import { parsePresetDefinition, PresetIdSchema } from "./preset-schema.ts";

export type PresetsState = { readonly byId: Readonly<Record<string, Preset>> };

export const INITIAL_PRESETS_STATE: PresetsState = { byId: BASE_PRESETS };

/** New presets go after the defaults unless they say otherwise. */
const USER_PRESET_ORDER = 100;

/** Own-property lookup: a preset id must never resolve to something on `Object.prototype`. */
export const presetById = (state: PresetsState, id: string): Preset | undefined =>
  Object.hasOwn(state.byId, id) ? state.byId[id] : undefined;

const put = (state: PresetsState, preset: Preset): PresetsState => ({
  byId: { ...state.byId, [preset.id]: preset },
});

/**
A creation is ignored when the id is taken (this is what makes the example seed
idempotent), when it is a built-in id or not a slug, or when the definition is invalid.
An unknown parent is stored as given: `resolvePreset` reports it, the editor prevents it.
*/
const created = (state: PresetsState, event: EventOf<"preset.created">): PresetsState => {
  const { id, name, extends: parent = null, definition, order = USER_PRESET_ORDER } = event.payload;
  if (
    !PresetIdSchema.safeParse(id).success ||
    isBuiltInPreset(id) ||
    presetById(state, id) !== undefined
  ) {
    return state;
  }
  const parsed = parsePresetDefinition(definition);
  if (!parsed.ok) {
    return state;
  }
  return put(state, {
    id,
    name,
    extends: parent,
    builtIn: false,
    archived: false,
    definition: parsed.value,
    createdAt: event.occurredAt,
    order,
  });
};

type UpdatePatch = EventOf<"preset.updated">["payload"];

/**
A definition replaces the whole stored definition; `extends: null` is a value. A default
preset keeps `extends: null`: its stored definition is read on top of its shipped values.
*/
const patched = (current: Preset, patch: UpdatePatch, definition?: PresetDefinition): Preset => ({
  ...current,
  name: patch.name ?? current.name,
  extends: patch.extends === undefined || current.builtIn ? current.extends : patch.extends,
  definition: definition ?? current.definition,
  order: patch.order ?? current.order,
});

const isSame = (a: Preset, b: Preset): boolean =>
  a.name === b.name &&
  a.extends === b.extends &&
  a.definition === b.definition &&
  a.order === b.order;

/** An invalid definition drops the whole event. */
const updated = (state: PresetsState, event: EventOf<"preset.updated">): PresetsState => {
  const { id, definition } = event.payload;
  const current = presetById(state, id);
  if (current === undefined) {
    return state;
  }
  const parsed = definition === undefined ? ok(undefined) : parsePresetDefinition(definition);
  if (!parsed.ok) {
    return state;
  }
  const next = patched(current, event.payload, parsed.value);
  return isSame(next, current) ? state : put(state, next);
};

/**
Archiving is how a preset is deleted: it leaves the pickers, its tasks keep resolving. To
bring it back, revoke the archive event. The inbox is where quick captures land, so it stays.
*/
const archived = (state: PresetsState, event: EventOf<"preset.archived">): PresetsState => {
  const current = presetById(state, event.payload.id);
  return current === undefined || current.id === "inbox" || current.archived
    ? state
    : put(state, { ...current, archived: true });
};

export const presetReducer: Reducer<PresetsState> = (state, event) => {
  if (event.type === "preset.created") {
    return created(state, event);
  }
  if (event.type === "preset.updated") {
    return updated(state, event);
  }
  return event.type === "preset.archived" ? archived(state, event) : state;
};
