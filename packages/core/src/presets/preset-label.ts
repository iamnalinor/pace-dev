import type { Preset } from "../model/preset.ts";

import { type Language, LANGUAGES, t } from "../i18n/i18n.ts";
import { BASE_PRESETS, isBuiltInPreset } from "./base-presets.ts";

/** A default preset under its shipped name is shown in the UI language; a renamed one as typed. */
export const presetLabel = (preset: Pick<Preset, "id" | "name">, language: Language): string =>
  isBuiltInPreset(preset.id) && preset.name === BASE_PRESETS[preset.id].name
    ? t(language, `preset.base.${preset.id}`)
    : preset.name;

/** Picker order: `order` ascending, then by name. */
export const byPresetOrder = (
  a: Pick<Preset, "name" | "order">,
  b: Pick<Preset, "name" | "order">,
): number => (a.order === b.order ? a.name.localeCompare(b.name) : a.order - b.order);

/**
The name a preset stores: a default given back its label in any language (the editor shows it in
the account's, QA round 23 R23-06) keeps its shipped name, so every language still shows its own
label; any other name as typed.
*/
export const storedPresetName = (id: string, name: string): string =>
  isBuiltInPreset(id) &&
  LANGUAGES.some((language) => t(language, `preset.base.${id}`) === name.trim())
    ? BASE_PRESETS[id].name
    : name;
