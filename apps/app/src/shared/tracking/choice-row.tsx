import type { ReactNode } from "react";

import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { ActionResult, StartOptions, TimeButtonView } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import type { CalendarToday } from "./calendar-today.ts";

/** What every list of a time-bar picker gets: its button, how to start a pick, and the way out. */
export type ListProps = {
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  /** Runs the pick; the picker closes once it went through. */
  readonly start: (result: ActionResult) => void;
  readonly options: StartOptions;
  readonly close: () => void;
};

/** One line of a picker: what starts, how long it usually takes, a check on the running one. */
export const ChoiceRow = ({
  aside,
  children,
  isRunning = false,
  label,
  onPress,
}: {
  readonly label: string;
  readonly aside: null | string;
  readonly isRunning?: boolean;
  /** Under the label (a task's project tag). */
  readonly children?: ReactNode;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  const t = useT();
  return (
    <Pressable
      // The check says it runs on the screen; the name says it to a screen reader.
      accessibilityLabel={isRunning ? t("time.buttonRunning", { label }) : label}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2 active:opacity-70"
      onPress={onPress}
    >
      <View className="flex-1 gap-1">
        <Text className="font-sans text-[15px] text-fg" numberOfLines={2}>
          {label}
        </Text>
        {children}
      </View>
      {aside === null ? null : (
        <Text className="font-sans text-[13px] tabular-nums text-muted">{aside}</Text>
      )}
      {isRunning ? <Check color={palette.fg} size={16} /> : null}
    </Pressable>
  );
};

/** A choice as an item of a `ChoiceList` (a list holds list items, the row sits inside). */
export const ChoiceItem = (props: Parameters<typeof ChoiceRow>[0]) => (
  <View role="listitem">
    <ChoiceRow {...props} />
  </View>
);

/** A picker's choices as a list named after what they are, so each picker reads as its own. */
export const ChoiceList = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <View aria-label={label} className="gap-2" role="list">
    {children}
  </View>
);

/** Quiet words where a list would be: why there is nothing to pick. */
export const Nothing = ({ children }: { readonly children: string }) => (
  <Text className="font-sans text-[14px] text-muted">{children}</Text>
);
