import type { RefObject } from "react";

import { View } from "react-native";

import type { TextTone } from "#app/ui/text-props.ts";
import type { TimeButtonView } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { fillClass } from "#app/ui/hue.ts";
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

/**
Every tile's box (spec §5.1): 56 high, the `md` corners, the width of its quarter, no side padding:
the centred label has the whole width («Календарь» needs 66 of a 68 tile at 320, where the 2 px
padding cut it to «Календ…», QA PR55-1-15). Never `flex-1`:
inside the tooltip's column that made the basis 0, which beat the height, and the tile shrank to the
44 of its target on the web (design review H5, bug-lessons class 160).
*/
const TILE = "h-bar-tile w-full items-center justify-center gap-0.5 rounded-md";

/**
How a tile looks (spec §5.1, F-COL-05, F-COL-12): neutral `fill.2` at rest, the Calendar tile with
nothing near included (never dashed or "disabled": its tooltip and hint say why); while its activity
runs, the `bg.cell` card (not the spec's `fill.3`: the stroke measures under 3:1 on it) with a bar
in its category's stroke along the bottom and its label in 600.
*/
const tileLook = (
  button: TimeButtonView,
): { readonly box: string; readonly icon: IconTone; readonly ink: TextTone } =>
  button.isRunning
    ? { box: "bg-cell", icon: "primary", ink: "primary" }
    : { box: "bg-fill-2", icon: "secondary", ink: "secondary" };

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
  const look = tileLook(button);
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
        shape="md"
      >
        {button.isRunning ? (
          <View
            className={cx("absolute inset-x-3 bottom-1 h-1 rounded-pill", fillClass(button.color))}
            testID="bar-tile-running"
          />
        ) : null}
        <Icon name={ICONS[button.id]} tone={look.icon} />
        <Text
          chrome
          className={cx("text-center", button.isRunning && "font-semibold")}
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
