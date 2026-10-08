import type { Translate } from "#web/i18n.tsx";

import { BASE_PRESETS, isBuiltInPreset } from "@pace/core";

/** A default category under its shipped name in the interface language; any other name as typed. */
export const presetLabel = (
  t: Translate,
  preset: { readonly id: string; readonly name: string },
): string =>
  isBuiltInPreset(preset.id) && preset.name === BASE_PRESETS[preset.id].name
    ? t(`preset.base.${preset.id}`)
    : preset.name;
