import type { Translate } from "#web/i18n.tsx";

import { isBuiltInPreset, type Preset } from "@pace/core";

/** Built-in presets are part of the interface and get translated; a user preset keeps its own name. */
export const presetLabel = (preset: Preset, t: Translate): string =>
  isBuiltInPreset(preset.id) ? t(`preset.base.${preset.id}`) : preset.name;
