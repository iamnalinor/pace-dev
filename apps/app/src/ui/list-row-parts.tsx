import type { ReactNode } from "react";

import { View } from "react-native";

import type { HapticKind } from "../platform/haptics.ts";

import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { Pressable } from "./pressable.tsx";
import { type RadioValue, useRadio } from "./radio-group.tsx";

/** A select row's frame: a radio of its group, named by its title (the subtitle is its hint). */
export const SelectFrame = ({
  className,
  disabled,
  draw,
  hint,
  name,
  testID,
  value,
}: {
  readonly className: string;
  readonly disabled: boolean | undefined;
  readonly testID: string | undefined;
} & {
  readonly draw: (isChosen: boolean) => ReactNode;
  readonly hint: string | undefined;
  readonly name: string;
  readonly value: RadioValue;
}) => {
  const { checked, onPress, setNode, tabIndex } = useRadio(value);
  return (
    <Pressable
      accessibilityHint={hint}
      checked={checked}
      className={className}
      disabled={disabled}
      label={name}
      onPress={onPress}
      ref={setNode}
      role="radio"
      tabIndex={tabIndex}
      testID={testID}
    >
      {draw(checked)}
    </Pressable>
  );
};

/** The trailing check of the chosen select row. */
const Check = ({ isChosen }: { readonly isChosen: boolean }) =>
  isChosen ? (
    <View testID="list-row-check">
      <Icon name="check" tone="accent" />
    </View>
  ) : null;

/** The 4 px accent bar at a selected row's leading edge (a cue that is not colour alone, F-COL-02). */
export const SelectedBar = () => (
  <View
    className="absolute inset-y-2 left-0.5 w-1 rounded-xs bg-accent"
    testID="list-row-selected-bar"
  />
);

/** `dataSet` is react-native-web's (React Native's types do not know it; native ignores it). */
const ROW_MARK = { dataSet: { paceRow: "true" } } as object;

/**
A row whose control sits beside its press area (`ListRow control`): the control's 48 column at the
leading edge, the selection fill under both, the press area after it.
*/
export const ControlRow = ({
  children,
  control,
  isSelected,
}: {
  readonly children: ReactNode;
  readonly control: ReactNode;
  readonly isSelected: boolean;
}) => (
  <View
    className={cx("relative flex-row", isSelected && "bg-fill-1")}
    // react-native-web writes `data-pace-row`: the web hovers the whole row (global.css, N7).
    {...ROW_MARK}
  >
    {isSelected ? <SelectedBar /> : null}
    <View className="pl-1" testID="list-row-control">
      {control}
    </View>
    {children}
  </View>
);

/** A switch row's frame: the whole row is the switch, named by its title (R23-10). */
export const ToggleFrame = ({
  children,
  disabled,
  haptic,
  hint,
  name,
  testID,
  toggle,
}: {
  readonly children: ReactNode;
  readonly disabled: boolean | undefined;
  readonly haptic: HapticKind | undefined;
  readonly hint: string | undefined;
  readonly name: string;
  readonly testID: string | undefined;
  readonly toggle: { readonly isOn: boolean; readonly onChange: (isOn: boolean) => void };
}) => (
  <Pressable
    accessibilityHint={hint}
    checked={toggle.isOn}
    className="relative flex-row"
    disabled={disabled}
    haptic={haptic}
    label={name}
    onPress={() => {
      toggle.onChange(!toggle.isOn);
    }}
    role="switch"
    testID={testID}
  >
    {children}
  </Pressable>
);

/** A select row's trailing end: what it trails, then the check once it is the chosen one. */
export const Chosen = ({
  children,
  isChosen,
}: {
  readonly children: ReactNode;
  readonly isChosen: boolean;
}) => (
  <View className="flex-row items-center gap-2">
    {children}
    <Check isChosen={isChosen} />
  </View>
);
