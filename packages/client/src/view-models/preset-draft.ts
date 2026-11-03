import {
  BASE_PRESETS,
  foldToLatin,
  isBuiltInPreset,
  type Language,
  type Preset,
  type PresetDefinition,
  PresetDefinitionSchema,
  type PresetFields,
  presetLabel,
  type PresetsState,
  type ResolvedPreset,
  resolvePreset,
} from "@pace/core";

/** Keys a child preset overrides as a whole. */
export type WholeKey = Exclude<keyof PresetDefinition, "fields">;

/** A key inside `fields`: they merge key by key, so each is its own override. */
export type SubKey = { readonly group: "fields"; readonly key: keyof PresetFields };

/**
What the editor holds: the definition stores exactly the overridden keys. A default preset
has no parent (`extends: null`): its keys are overridden against its shipped values.
*/
export type PresetDraft = {
  readonly id: string;
  readonly name: string;
  readonly extends: null | string;
  readonly definition: PresetDefinition;
};

/**
A default preset that was never edited still stores its shipped values: nothing is overridden.
Its name is the one the list shows in `language` (QA round 23 R23-06: the field said "Work" under
«Работа»); `storedPresetName` gives the shipped name back on save.
*/
export const editorDraft = (preset: Preset, language: Language = "en"): PresetDraft => ({
  definition:
    isBuiltInPreset(preset.id) && preset.definition === BASE_PRESETS[preset.id].definition
      ? {}
      : preset.definition,
  extends: preset.extends,
  id: preset.id,
  name: presetLabel(preset, language),
});

/** A new preset starts from a parent, with nothing of its own yet. */
export const newDraft = (parentId: string): PresetDraft => ({
  definition: {},
  extends: parentId,
  id: "",
  name: "",
});

/** What the draft's unset keys fall back to: a default's shipped values, else the parent chain. */
export const inheritedOf = (presets: PresetsState, draft: PresetDraft): ResolvedPreset => {
  if (draft.extends === null) {
    return isBuiltInPreset(draft.id)
      ? BASE_PRESETS[draft.id].definition
      : BASE_PRESETS.personal.definition;
  }
  const resolved = resolvePreset(presets, draft.extends);
  return resolved.ok ? resolved.value : BASE_PRESETS.personal.definition;
};

export const isOverridden = (definition: PresetDefinition, key: WholeKey): boolean =>
  definition[key] !== undefined;

export const isSubOverridden = (definition: PresetDefinition, sub: SubKey): boolean =>
  definition.fields?.[sub.key] !== undefined;

export const setValue = <K extends WholeKey>(
  definition: PresetDefinition,
  key: K,
  value: ResolvedPreset[K],
): PresetDefinition => ({ ...definition, [key]: value });

const without = (definition: PresetDefinition, key: keyof PresetDefinition): PresetDefinition => {
  const { [key]: _removed, ...rest } = definition;
  return rest;
};

/** Overriding starts from the inherited value; un-overriding drops the key. */
export const toggleOverride = (
  definition: PresetDefinition,
  key: WholeKey,
  inherited: ResolvedPreset,
): PresetDefinition =>
  isOverridden(definition, key)
    ? without(definition, key)
    : setValue(definition, key, inherited[key]);

export const setSub = (
  definition: PresetDefinition,
  sub: SubKey,
  isShown: boolean,
): PresetDefinition => ({ ...definition, fields: { ...definition.fields, [sub.key]: isShown } });

const withoutSub = (definition: PresetDefinition, sub: SubKey): PresetDefinition => {
  const { [sub.key]: _removed, ...rest }: Readonly<Record<string, unknown>> =
    definition[sub.group] ?? {};
  return Object.keys(rest).length === 0
    ? without(definition, sub.group)
    : { ...definition, [sub.group]: rest };
};

export const toggleSubOverride = (
  definition: PresetDefinition,
  sub: SubKey,
  inherited: ResolvedPreset,
): PresetDefinition => {
  return isSubOverridden(definition, sub)
    ? withoutSub(definition, sub)
    : setSub(definition, sub, inherited.fields[sub.key]);
};

/** Where the schema rejects the definition: the top key, or `fields.key` inside fields. */
export const definitionIssues = (definition: PresetDefinition): ReadonlySet<string> => {
  const parsed = PresetDefinitionSchema.safeParse(definition);
  if (parsed.success) {
    return new Set();
  }
  return new Set(
    parsed.error.issues.map((issue) => {
      const [top = "", sub] = issue.path.map(String);
      return sub !== undefined && top === "fields" ? `${top}.${sub}` : top;
    }),
  );
};

/**
A preset id from its name: lowercase ASCII words joined by `-`. Russian is spelt in Latin letters
and accents are dropped (`Алгебра` → `algebra`, `Café` → `cafe`); other scripts are dropped.
*/
export const slugify = (name: string): string =>
  foldToLatin(name)
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== "")
    .join("-");

/** The longest slug kept from a name: room for a `-NNN` after it within the id's 64. */
const SLUG_MAX = 56;

/** Ids a preset may not take: the address of the new preset form. */
const RESERVED_IDS: ReadonlySet<string> = new Set(["new"]);

/** The name's slug cut to `max` (never ending in a hyphen), or `preset` for one it cannot spell. */
const slugBase = (name: string, max: number): string => {
  // A slug has single hyphens between words, so a cut leaves at most one at its end.
  const cut = slugify(name).slice(0, max);
  const slug = cut.endsWith("-") ? cut.slice(0, -1) : cut;
  return slug === "" ? "preset" : slug;
};

/** `base`, or `base-2`, `base-3`… past an id already taken (an archived preset too), a default or a reserved one. */
const firstFree = (state: PresetsState, base: string): string => {
  const isFree = (id: string): boolean =>
    !RESERVED_IDS.has(id) && !isBuiltInPreset(id) && !Object.hasOwn(state.byId, id);
  const free = Array.from({ length: Object.keys(state.byId).length + 2 }, (_, step) =>
    step === 0 ? base : `${base}-${String(step + 1)}`,
  ).find((id) => isFree(id));
  return free ?? `${base}-${String(Object.keys(state.byId).length + 3)}`;
};

/**
The id a preset's name reads as (QA round 18 L4: nobody types an id): the name's slug, or
`preset` for a name with no letters it can spell, numbered `-2`, `-3`… past an id already taken
by a preset (an archived one too), a default or the new form's own address.
*/
export const freePresetId = (state: PresetsState, name: string): string =>
  firstFree(state, slugBase(name, SLUG_MAX));

/** The characters of a fresh id (a ULID's random end) that set a new preset's id apart. */
const UNIQUE_CHARS = 6;

/**
The id a new preset gets: its name's slug and the end of a fresh id (`unique`, a ULID). Two devices
that create the same name offline otherwise both took `gym`, and the merge kept the first and
dropped the second's `preset.created` (the reducer ignores an id it has), its tasks then read
under the other's definition (pr48 follow-up).
*/
export const newPresetId = (state: PresetsState, name: string, unique: string): string =>
  firstFree(
    state,
    `${slugBase(name, SLUG_MAX - UNIQUE_CHARS - 1)}-${unique.slice(-UNIQUE_CHARS).toLowerCase()}`,
  );
