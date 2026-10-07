import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatDue } from "#web/shared/format/time.ts";
import { presetLabel } from "#web/shared/lib/preset-label.ts";
import {
  type Preset,
  presetById,
  projectById,
  type ProjectColorName,
  resolvePreset,
  type Suggestion,
} from "@pace/core";

import type { ChipField } from "./suggestion-chips.ts";

export type ChipText = {
  readonly text: (field: ChipField, suggestion: Suggestion) => string;
  readonly color: (suggestion: Suggestion) => null | ProjectColorName;
  readonly presetColor: (suggestion: Suggestion) => null | ProjectColorName;
  readonly presetName: (preset: Preset) => string;
};

/** How each chip reads for a (possibly edited) suggestion; built-in preset names are translated. */
export const useChipText = (): ChipText => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const projects = hooks.useAppState((state) => state.projects);
  const presets = hooks.useAppState((state) => state.presets);
  const { deviceTz, now } = hooks.useClock();
  const presetName = (preset: Preset): string => presetLabel(t, preset);
  const project = (suggestion: Suggestion) =>
    suggestion.projectId === null ? undefined : projectById(projects, suggestion.projectId);
  const text = (field: ChipField, suggestion: Suggestion): string => {
    switch (field) {
      case "due": {
        return suggestion.dueAt === null || suggestion.dueTz === null
          ? t("inbox.noDeadline")
          : formatDue({ at: suggestion.dueAt, tz: suggestion.dueTz }, { deviceTz, language, now });
      }
      case "importance": {
        return t(`importance.${suggestion.importance}`);
      }
      case "preset": {
        const preset = presetById(presets, suggestion.presetId);
        return preset === undefined ? suggestion.presetId : presetName(preset);
      }
      case "project": {
        return project(suggestion)?.name ?? t("task.noProject");
      }
    }
  };
  const presetColor = (suggestion: Suggestion): null | ProjectColorName => {
    const resolved = resolvePreset(presets, suggestion.presetId);
    return resolved.ok ? resolved.value.color : null;
  };
  return {
    color: (suggestion) => project(suggestion)?.color ?? null,
    presetColor,
    presetName,
    text,
  };
};
