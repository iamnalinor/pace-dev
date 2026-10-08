import type { Preset } from "../model/preset.ts";

import { type Language, t } from "../i18n/i18n.ts";
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
