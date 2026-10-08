import {
  BASE_PRESETS,
  isBuiltInPreset,
  type NotifyParams,
  type Preset,
  type PresetDefinition,
  PresetDefinitionSchema,
  type PresetFields,
  type PresetsState,
  type ResolvedPreset,
  resolvePreset,
} from "@pace/core";

/** Keys a child preset overrides as a whole. */
export type WholeKey = Exclude<keyof PresetDefinition, "fields" | "notify">;

/** A key inside `fields` or `notify`: those merge key by key, so each is its own override. */
export type SubKey =
  | { readonly group: "fields"; readonly key: keyof PresetFields }
  | { readonly group: "notify"; readonly key: keyof NotifyParams };

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

/** A default preset that was never edited still stores its shipped values: nothing is overridden. */
export const editorDraft = (preset: Preset): PresetDraft => ({
  definition:
    isBuiltInPreset(preset.id) && preset.definition === BASE_PRESETS[preset.id].definition
      ? {}
      : preset.definition,
  extends: preset.extends,
  id: preset.id,
  name: preset.name,
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
  (sub.group === "fields" ? definition.fields?.[sub.key] : definition.notify?.[sub.key]) !==
  undefined;

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
  value: boolean | number,
): PresetDefinition =>
  sub.group === "fields"
    ? { ...definition, fields: { ...definition.fields, [sub.key]: value } }
    : { ...definition, notify: { ...definition.notify, [sub.key]: value } };

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
  if (isSubOverridden(definition, sub)) {
    return withoutSub(definition, sub);
  }
  return setSub(
    definition,
    sub,
    sub.group === "fields" ? inherited.fields[sub.key] : inherited.notify[sub.key],
  );
};

/** Where the schema rejects the definition: the top key, or `group.key` inside fields / notify. */
export const definitionIssues = (definition: PresetDefinition): ReadonlySet<string> => {
  const parsed = PresetDefinitionSchema.safeParse(definition);
  if (parsed.success) {
    return new Set();
  }
  return new Set(
    parsed.error.issues.map((issue) => {
      const [top = "", sub] = issue.path.map(String);
      return sub !== undefined && (top === "fields" || top === "notify") ? `${top}.${sub}` : top;
    }),
  );
};

/** A preset id from its name: lowercase ASCII words joined by `-` (other scripts are dropped). */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== "")
    .join("-");
