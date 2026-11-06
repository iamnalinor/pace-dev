import type { ReactNode } from "react";

import { View } from "react-native";

import type { ActionResult, StartOptions, TimeButtonView } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { Text } from "#app/ui/text.tsx";

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
  const t = useT();
  const trailing =
    aside === null && !isRunning ? undefined : (
      <View className="flex-row items-center gap-2">
        {aside === null ? null : (
          <Text numeric role="footnote" tone="secondary">
            {aside}
          </Text>
        )}
        {isRunning ? <Icon name="check" size="inline" tone="primary" /> : null}
      </View>
    );
  return (
    <ListRow
      // The check says it runs on the screen; the name says it to a screen reader.
      haptic={isRunning ? undefined : "tick"}
      label={isRunning ? t("time.buttonRunning", { label }) : label}
      meta={children}
      onPress={onPress}
      title={label}
      titleLines={2}
      trailing={trailing}
    />
  );
};

/** A choice as an item of a `ChoiceList` (a list holds list items, the row sits inside). */
export const ChoiceItem = (props: Parameters<typeof ChoiceRow>[0]) => (
  <View role="listitem">
    <ChoiceRow {...props} />
  </View>
);

/** A picker's choices as one group named after what they are, so each picker reads as its own. */
export const ChoiceList = ({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) => (
  <Group aria-label={label} inset={false} role="list" separatorInset="row">
    {children}
  </Group>
);

/** Quiet words where a list would be: why there is nothing to pick. */
export const Nothing = ({ children }: { readonly children: string }) => (
  <Text role="subhead" tone="secondary">
    {children}
  </Text>
);
