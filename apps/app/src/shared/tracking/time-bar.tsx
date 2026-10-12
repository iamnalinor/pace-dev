import {
  CalendarDays,
  Coffee,
  Dumbbell,
  Ellipsis,
  House,
  type LucideIcon,
  Play,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { TimeButtonView } from "@pace/client";
import type { Event } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { inkClass, OUTLINE } from "#app/ui/color.tsx";
import { contextMenuProps } from "#app/ui/context-menu.ts";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { calendarToday } from "./calendar-source.ts";
import { type CalendarToday, eventOnNow } from "./calendar-today.ts";
import { ChoicesSheet } from "./choices-sheet.tsx";
import { RunningRow } from "./running-row.tsx";

const ICONS: Readonly<Record<TimeButtonView["id"], LucideIcon>> = {
  calendar: CalendarDays,
  chores: House,
  rest: Coffee,
  sport: Dumbbell,
};

const startedId = (events: readonly Event[]): null | string => {
  const started = events.find((event) => event.type === "activity.started");
  return started?.type === "activity.started" ? started.payload.activityId : null;
};

/**
"What are you doing?" and ▶ on one line: Enter starts it at once with the words as typed (a
length in them as the Expect); the assistant's reading of it follows in the background.
*/
const TypedStart = ({
  onReading,
}: {
  /** The activity whose words the assistant reads (`true`), then once it answered (`false`). */
  readonly onReading: (activityId: string, isReading: boolean) => void;
}) => {
  const t = useT();
  const { actions, assistant } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const [text, setText] = useState("");
  const typed = text.trim();
  const start = async (): Promise<void> => {
    if (typed === "") {
      return;
    }
    const result = await actions.startTyped(typed);
    if (!(await run(Promise.resolve(result))) || !result.ok) {
      return;
    }
    setText("");
    const activityId = startedId(result.value);
    if (activityId === null) {
      return;
    }
    onReading(activityId, true);
    try {
      const reading = await assistant.readActivity(typed);
      if (reading !== null) {
        await actions.refineActivity(activityId, { ...reading, typed });
      }
    } finally {
      onReading(activityId, false);
    }
  };
  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        accessibilityLabel={t("time.whatDoing")}
        className="h-11 flex-1 rounded-lg border border-line bg-surface px-3 font-sans text-[15px] text-fg"
        maxLength={200}
        onChangeText={setText}
        onSubmitEditing={() => void start()}
        placeholder={t("time.whatDoing")}
        placeholderTextColor={palette.muted}
        returnKeyType="go"
        value={text}
      />
      <Pressable
        accessibilityLabel={t("time.start")}
        accessibilityRole="button"
        accessibilityState={{ disabled: typed === "" }}
        className={cx(
          "h-11 w-11 items-center justify-center rounded-lg bg-accent active:opacity-80",
          typed === "" && "opacity-50",
        )}
        disabled={typed === ""}
        onPress={() => void start()}
      >
        <Play color={palette.accentFg} fill={palette.accentFg} size={16} />
      </Pressable>
    </View>
  );
};

type ButtonProps = {
  readonly button: TimeButtonView;
  readonly onTap: (button: TimeButtonView) => void;
  readonly onMore: (button: TimeButtonView) => void;
};

/**
A big button in its fixed place: icon over name, its color's outline, filled with the accent while it runs.
A long press, a right click or "⋯" opens what it can start and "alongside".
*/
const BarButton = ({ button, onMore, onTap }: ButtonProps) => {
  const t = useT();
  const { palette } = useTheme();
  const label = t(button.labelKey);
  const Icon = ICONS[button.id];
  const more = (): void => {
    onMore(button);
  };
  return (
    <View className="relative flex-1">
      <Pressable
        accessibilityActions={[{ label: t("time.more", { label }), name: "longpress" }]}
        accessibilityHint={t("time.buttonHint")}
        accessibilityLabel={label}
        accessibilityRole="switch"
        aria-checked={button.isRunning}
        className={cx(
          "h-14 items-center justify-center gap-0.5 rounded-xl border-2 px-1 active:opacity-80",
          button.isRunning ? "border-accent bg-accent" : cx(OUTLINE[button.color], "bg-surface"),
        )}
        delayLongPress={450}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "longpress") {
            more();
          }
        }}
        onLongPress={more}
        onPress={() => {
          onTap(button);
        }}
        {...contextMenuProps(more)}
      >
        <Icon color={button.isRunning ? palette.accentFg : palette.fg2} size={18} />
        <Text
          className={cx(
            "text-center font-sans text-[12px] leading-[14px]",
            button.isRunning ? "font-medium text-accentFg" : inkClass(button.color),
          )}
          numberOfLines={2}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={t("time.more", { label })}
        accessibilityRole="button"
        className="absolute -right-1 -top-1 h-11 w-11 items-start justify-start rounded-md pl-4 pt-2 active:opacity-60"
        hitSlop={6}
        onPress={more}
      >
        <Ellipsis color={palette.muted} size={16} />
      </Pressable>
    </View>
  );
};

type Opened = { readonly button: TimeButtonView; readonly calendar: CalendarToday | null };

/** What a tap does: stop the running button, start the calendar's event or a single choice, or ask. */
const useTap = (open: (opened: Opened) => void) => {
  const { actions, api } = usePace();
  const { deviceTz, now } = useViewer();
  const run = useRunAction();
  const calendarOf = async (button: TimeButtonView): Promise<CalendarToday | null> =>
    button.kind === "calendar" ? await calendarToday({ api, now, zone: deviceTz }) : null;
  const tap = async (button: TimeButtonView): Promise<void> => {
    if (button.isRunning) {
      await run(actions.stopActivity());
      return;
    }
    const calendar = await calendarOf(button);
    const current = calendar === null ? null : eventOnNow(calendar.events, now);
    const [only] = button.choices;
    if (current !== null) {
      await run(actions.startCalendar(current));
    } else if (only !== undefined && button.choices.length === 1) {
      await run(actions.startChoice(only.id));
    } else {
      open({ button, calendar });
    }
  };
  const more = async (button: TimeButtonView): Promise<void> => {
    open({ button, calendar: await calendarOf(button) });
  };
  return { more, tap };
};

/**
The time bar under Now, where the thumb rests: what runs (and what runs alongside), "What are
you doing?", and four buttons that never move: From calendar, Rest, Sport and Chores.
*/
export const TimeBar = () => {
  const t = useT();
  const { hooks } = usePace();
  const { alongside, buttons, running } = hooks.useTimeBar();
  const [opened, setOpened] = useState<null | Opened>(null);
  // The typed activities the assistant is still reading (two can be in flight).
  const [reading, setReading] = useState<ReadonlySet<string>>(() => new Set());
  const { more, tap } = useTap(setOpened);
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="gap-2 border-t border-line bg-bg px-3 pb-2.5 pt-2.5"
      role="region"
    >
      {[...(running === null ? [] : [running]), ...alongside].map((item) => (
        <RunningRow isDraft={reading.has(item.activityId)} key={item.activityId} running={item} />
      ))}
      <TypedStart
        onReading={(activityId, isReading) => {
          setReading((current) => {
            const others = [...current].filter((id) => id !== activityId);
            return new Set(isReading ? [...others, activityId] : others);
          });
        }}
      />
      <View className="flex-row gap-2">
        {buttons.map((button) => (
          <BarButton
            button={button}
            key={button.id}
            onMore={(pressed) => void more(pressed)}
            onTap={(pressed) => void tap(pressed)}
          />
        ))}
      </View>
      {opened === null ? null : (
        <ChoicesSheet
          button={opened.button}
          calendar={opened.calendar}
          canGoAlongside={running !== null && !opened.button.isRunning}
          onClose={() => {
            setOpened(null);
          }}
        />
      )}
    </View>
  );
};
