import type { ReactNode } from "react";

import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { PaceSwitch } from "#app/ui/switch-row.tsx";

/** Not overridden: the control shows the inherited value and cannot be changed. */
export type RowState = { readonly disabled: boolean; readonly invalid: boolean };

/**
One setting of a preset: its label, an "override" switch, and the control. Until the switch
is on the control shows what the parent chain gives and nothing is stored for it.
*/
export const OverrideRow = ({
  children,
  invalid = false,
  isOverridden,
  label,
  onToggle,
  inheritedHint,
}: {
  readonly label: string;
  readonly isOverridden: boolean;
  readonly onToggle: () => void;
  /** Where the value comes from, shown while the row is not overridden. */
  readonly inheritedHint: string;
  readonly invalid?: boolean;
  readonly children: (state: RowState) => ReactNode;
}) => {
  const t = useT();
  const isDisabled = !isOverridden;
  return (
    <View accessibilityLabel={label} className="gap-2 border-t border-line py-3" role="group">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 font-sans text-[14px] text-fg2">{label}</Text>
        <Text className="font-sans text-[12px] text-muted">{t("presets.overrideShort")}</Text>
        <PaceSwitch
          isOn={isOverridden}
          label={t("presets.override", { field: label })}
          onChange={onToggle}
        />
      </View>
      <View
        aria-disabled={isDisabled}
        className={isDisabled ? "opacity-60" : ""}
        style={{ pointerEvents: isDisabled ? "none" : "auto" }}
      >
        {children({ disabled: isDisabled, invalid })}
      </View>
      {isDisabled ? (
        <Text className="font-sans text-[12px] text-faint">{inheritedHint}</Text>
      ) : null}
      {invalid ? (
        <Text className="font-sans text-[12px] text-warn">{t("presets.checkValue")}</Text>
      ) : null}
    </View>
  );
};
