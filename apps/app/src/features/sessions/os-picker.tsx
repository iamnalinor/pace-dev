import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { COMPUTER_OSES, type ComputerOs } from "@pace/client";

const NAME_KEY: Readonly<Record<ComputerOs, MessageKey>> = {
  linux: "devices.osLinux",
  macos: "devices.osMacos",
  windows: "devices.osWindows",
};

const MARK_SIZE = 16;

/**
A small mark that recalls each system (not its logo): four panes, an apple, a penguin. `ink`
draws it; `cutout` is the segment's own fill, for the penguin's belly and eyes.
*/
const Mark = ({
  cutout,
  ink,
  os,
}: {
  readonly cutout: string;
  readonly ink: string;
  readonly os: ComputerOs;
}) => (
  <Svg height={MARK_SIZE} viewBox="0 0 16 16" width={MARK_SIZE}>
    {os === "windows" && (
      <>
        <Path
          d="M2 1h4.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z"
          fill={ink}
        />
        <Path
          d="M9.5 1H14a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z"
          fill={ink}
        />
        <Path
          d="M2 8.5h4.5a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"
          fill={ink}
        />
        <Path
          d="M9.5 8.5H14a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"
          fill={ink}
        />
      </>
    )}
    {os === "macos" && (
      <>
        <Path
          d="M8 5.2C6.9 4.4 4.6 4.3 3.5 6c-1.2 1.8-.9 4.8.8 7 .7 1 1.4 1.7 2.3 1.7.7 0 .9-.4 1.4-.4s.7.4 1.4.4c.9 0 1.6-.7 2.3-1.7 1.7-2.2 2-5.2.8-7C11.4 4.3 9.1 4.4 8 5.2Z"
          fill={ink}
        />
        <Path d="M8.2 4.6c0-1.7 1-2.9 2.6-3.1 0 1.7-1 2.9-2.6 3.1Z" fill={ink} />
      </>
    )}
    {os === "linux" && (
      <>
        <Path
          d="M8 1C6.1 1 5 2.6 5 4.7c0 1-.4 1.9-1.2 3C3 8.9 2.4 10.4 2.4 11.6 2.4 13.6 4.9 15 8 15s5.6-1.4 5.6-3.4c0-1.2-.6-2.7-1.4-3.9-.8-1.1-1.2-2-1.2-3C11 2.6 9.9 1 8 1Z"
          fill={ink}
        />
        <Ellipse cx={8} cy={10.8} fill={cutout} rx={2.9} ry={3.4} />
        <Circle cx={7} cy={4.4} fill={cutout} r={0.7} />
        <Circle cx={9} cy={4.4} fill={cutout} r={0.7} />
      </>
    )}
  </Svg>
);

/** Windows, macOS or Linux as one row of segments; the chosen one in the quiet accent. */
export const OsPicker = ({
  chosenRef,
  onChange,
  value,
}: {
  /** The chosen segment, for focus to land on as the picker appears. */
  readonly chosenRef?: (node: null | View) => void;
  readonly onChange: (os: ComputerOs) => void;
  readonly value: ComputerOs;
}) => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View accessibilityLabel={t("devices.os")} className="flex-row gap-1.5" role="radiogroup">
      {COMPUTER_OSES.map((os) => {
        const isChosen = os === value;
        return (
          <Pressable
            accessibilityLabel={t(NAME_KEY[os])}
            accessibilityRole="radio"
            aria-checked={isChosen}
            className={cx(
              "h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border-2 px-2 active:opacity-80",
              isChosen ? "border-accentQuiet bg-accentQuiet" : "border-line bg-surface",
            )}
            key={os}
            onPress={() => {
              onChange(os);
            }}
            ref={isChosen ? chosenRef : undefined}
          >
            <Mark
              cutout={isChosen ? palette.accentQuiet : palette.surface}
              ink={isChosen ? palette.accentQuietFg : palette.fg2}
              os={os}
            />
            <Text
              className={cx(
                "font-sans text-[13px]",
                isChosen ? "font-medium text-accentQuietFg" : "text-fg2",
              )}
              numberOfLines={1}
            >
              {t(NAME_KEY[os])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
