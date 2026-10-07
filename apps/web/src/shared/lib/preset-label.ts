import { isBuiltInPreset } from "@pace/core";

import type { Translate } from "#web/i18n.tsx";

/** A built-in category's name in the interface language; a user's own name as typed. */
export const presetLabel = (
  t: Translate,
  preset: { readonly id: string; readonly name: string },
): string => (isBuiltInPreset(preset.id) ? t(`preset.base.${preset.id}`) : preset.name);
