import type { Translate } from "#web/i18n.tsx";
import type { Preset } from "@pace/core";

import { presetLabel as sharedLabel } from "#web/shared/lib/preset-label.ts";

/** The presets screens take the preset first. */
export const presetLabel = (preset: Preset, t: Translate): string => sharedLabel(t, preset);
