import type { RefObject } from "react";

import { View } from "react-native";

import type { TextTone } from "#app/ui/text-props.ts";
import type { TimeButtonView } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { outlineClass } from "#app/ui/hue.ts";
import { Icon, type IconName, type IconTone } from "#app/ui/icon.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";

const ICONS: Readonly<Record<TimeButtonView["id"], IconName>> = {
  calendar: "calendar-days",
  chores: "house",
  rest: "coffee",
  task: "timer",
};

/** Every tile's frame is the same 2 px border, so a state never changes its size. */
const TILE = "h-16 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-xl border-2 px-1";

/**
How a tile looks (spec 4.3.7): neutral at rest, dashed and quiet when it cannot start anything
now (the Calendar tile), and while its activity runs its own category's stroke.
*/
const tileLook = (
  button: TimeButtonView,
  isGreyed: boolean,
): { readonly box: string; readonly icon: IconTone; readonly ink: TextTone } => {
  if (button.isRunning) {
    return {
      box: cx("bg-cell", outlineClass(button.color)),
      icon: "primary",
      ink: "primary",
    };
  }
  return isGreyed
    ? { box: "border-dashed border-outline bg-cell", icon: "tertiary", ink: "tertiary" }
    : { box: "border-transparent bg-cell", icon: "secondary", ink: "secondary" };
};

/**
One of the four fixed tiles: icon over the name on one line, the same size and place whatever the
name's length (a long Russian one is cut, never wrapped). A tap always opens its picker.
*/
export const BarTile = ({
  anchor,
  button,
  onTap,
  unavailable,
}: {
  readonly anchor: RefObject<null | View>;
  readonly button: TimeButtonView;
  readonly onTap: (button: TimeButtonView) => void;
  /** Why it cannot start anything now (the Calendar tile), shown in its tooltip. */
  readonly unavailable?: string | undefined;
}) => {
  const t = useT();
  const label = t(button.labelKey);
  const look = tileLook(button, unavailable !== undefined);
  return (
    <Tooltip isFilling isImmediate label={unavailable}>
      <Pressable
        accessibilityHint={
          unavailable ?? t(button.isRunning ? "time.buttonRunningHint" : "time.buttonHint")
        }
        className={cx(TILE, look.box)}
        label={button.isRunning ? t("time.buttonRunning", { label }) : label}
        onPress={() => {
          onTap(button);
        }}
        ref={anchor}
        role="button"
        shape="xl"
      >
        <Icon name={ICONS[button.id]} tone={look.icon} />
        <Text
          chrome
          className={cx("text-center", button.isRunning && "font-medium")}
          policy="truncate"
          role="caption"
          tone={look.ink}
        >
          {label}
        </Text>
      </Pressable>
    </Tooltip>
  );
};

/** The four tiles in their fixed places. */
export const BarTiles = ({
  anchors,
  buttons,
  calendarUnavailable,
  onTap,
}: {
  readonly anchors: Readonly<Record<TimeButtonView["id"], RefObject<null | View>>>;
  readonly buttons: readonly TimeButtonView[];
  readonly calendarUnavailable: string | undefined;
  readonly onTap: (button: TimeButtonView) => void;
}) => (
  <View className="flex-row gap-2">
    {buttons.map((button) => (
      <BarTile
        anchor={anchors[button.id]}
        button={button}
        key={button.id}
        onTap={onTap}
        // Running its own activity, it is on, whatever the calendar says.
        unavailable={
          button.kind === "calendar" && !button.isRunning ? calendarUnavailable : undefined
        }
      />
    ))}
  </View>
);
