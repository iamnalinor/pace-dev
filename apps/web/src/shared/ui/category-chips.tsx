import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { presetLabel } from "#web/shared/lib/preset-label.ts";
import { type Importance, resolvePreset } from "@pace/core";

import { ChipGroup } from "./chip-group.tsx";

type Props = {
  readonly value: string;
  /** The category's default importance comes along, so the caller can preselect it. */
  readonly onChange: (presetId: string, defaultImportance: Importance) => void;
  readonly className?: string | undefined;
};

/** Every active category (preset) as a one-tap chip in its colour; Inbox is not a choice. */
export const CategoryChips = ({ className, onChange, value }: Props) => {
  const t = useT();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const options = Object.values(presets.byId)
    .filter((preset) => !preset.archived && (preset.id !== "inbox" || preset.id === value))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((preset) => {
      const resolved = resolvePreset(presets, preset.id);
      return {
        color: resolved.ok ? resolved.value.color : null,
        defaultImportance: resolved.ok ? resolved.value.defaultImportance : "normal",
        label: presetLabel(t, preset),
        value: preset.id,
      } as const;
    });
  return (
    <ChipGroup
      className={className}
      label={t("composer.category")}
      onChange={(presetId) => {
        const chosen = options.find((option) => option.value === presetId);
        onChange(presetId, chosen?.defaultImportance ?? "normal");
      }}
      options={options}
      value={value}
    />
  );
};
