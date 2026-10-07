import {
  type NotifyParams,
  type PresetDefinition,
  PresetDefinitionSchema,
  type PresetFields,
  type ResolvedPreset,
} from "@pace/core";

/** Keys a child preset overrides as a whole. */
export type WholeKey = Exclude<keyof PresetDefinition, "fields" | "notify">;

/** A key inside `fields` or `notify`: those merge key by key, so each is its own override. */
export type SubKey =
  | { readonly group: "fields"; readonly key: keyof PresetFields }
  | { readonly group: "notify"; readonly key: keyof NotifyParams };

/** What the editor holds: the definition stores exactly the overridden keys. */
export type PresetDraft = {
  readonly id: string;
  readonly name: string;
  readonly extends: string;
  readonly definition: PresetDefinition;
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

const without = <K extends keyof PresetDefinition>(
  definition: PresetDefinition,
  key: K,
): PresetDefinition => {
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
      return (top === "fields" || top === "notify") && sub !== undefined ? `${top}.${sub}` : top;
    }),
  );
};

/** A preset id from its name: lowercase ASCII words joined by `-` (other scripts are dropped). */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
