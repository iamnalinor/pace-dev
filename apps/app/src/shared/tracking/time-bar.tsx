import {
  CalendarDays,
  Coffee,
  Dumbbell,
  Ellipsis,
  House,
  type LucideIcon,
  Play,
  Square,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ColorTag, inkClass, OUTLINE, PROJECT_FILL } from "#app/ui/color.tsx";
import { contextMenuProps } from "#app/ui/context-menu.ts";
import { cx } from "#app/ui/cx.ts";
import { PulseDot } from "#app/ui/pulse-dot.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { PACE_STATUS_TEXT, type RunningView, type TimeButtonView } from "@pace/client";
import { type Event, formatDuration } from "@pace/core";

import { calendarToday } from "./calendar-source.ts";
import { type CalendarToday, eventOnNow } from "./calendar-today.ts";
import { ChoicesSheet } from "./choices-sheet.tsx";

const ICONS: Readonly<Record<TimeButtonView["id"], LucideIcon>> = {
  calendar: CalendarDays,
  chores: House,
  rest: Coffee,
  sport: Dumbbell,
};

const percent = (share: number): `${number}%` => `${Math.round(share * 100)}%`;

/** An Expect is a day at most. */
const MAX_EXPECT_MINUTES = 24 * 60;

/** The running activity's line under its label: the time, the Expect and, at twice it, the question. */
const RunningMeta = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { language } = useViewer();
  const statusKey = PACE_STATUS_TEXT[running.status];
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <PulseDot className={PROJECT_FILL[running.color]} />
      <ColorTag color={running.color}>{running.label}</ColorTag>
      <Text className="font-sans text-[13px] tabular-nums text-fg">
        {formatDuration(running.minutes, language)}
      </Text>
      {running.expectMinutes === null ? null : (
        <Text className="font-sans text-[12px] text-muted">
          {t("time.expectOf", { duration: formatDuration(running.expectMinutes, language) })}
        </Text>
      )}
      {running.isAlongside ? (
        <Text className="font-sans text-[12px] text-muted">{t("time.alongsideTag")}</Text>
      ) : null}
      {statusKey === null ? null : (
        <Text className="font-sans text-[12px] font-medium text-warn">{t(statusKey)}</Text>
      )}
    </View>
  );
};

/** One running activity: what, how long, its progress to the Expect; "Yes, still" and Stop. */
const RunningRow = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const isLong = running.status === "long";
  return (
    <View className="flex-row items-center gap-2">
      <View accessibilityLiveRegion="polite" className="flex-1 gap-1">
        <RunningMeta running={running} />
        {running.share === null ? null : (
          <View className="h-1 overflow-hidden rounded-full bg-track">
            <View
              className={cx(
                "h-full rounded-full",
                isLong ? "bg-warn" : PROJECT_FILL[running.color],
              )}
              style={{ width: percent(running.share) }}
            />
          </View>
        )}
      </View>
      {isLong ? (
        <Pressable
          accessibilityRole="button"
          className="h-9 justify-center rounded-lg border border-line px-3 active:opacity-70"
          onPress={() => {
            // Still going: what it took so far becomes its Expect, so the next ask is twice that.
            void run(
              actions.relabelActivity(running.activityId, {
                expectMinutes: Math.min(running.minutes, MAX_EXPECT_MINUTES),
              }),
            );
          }}
        >
          <Text className="font-sans text-[13px] text-fg">{t("time.stillYes")}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={`${t("time.stop")}: ${running.label}`}
        accessibilityRole="button"
        className="h-9 flex-row items-center gap-1.5 rounded-lg border border-line px-3 active:opacity-70"
        hitSlop={6}
        onPress={() => {
          void run(actions.stopActivity({ activityId: running.activityId }));
        }}
      >
        <Square color={palette.fg} size={14} />
        <Text className="font-sans text-[13px] text-fg">{t("time.stop")}</Text>
      </Pressable>
    </View>
  );
};

const startedId = (events: readonly Event[]): null | string => {
  const started = events.find((event) => event.type === "activity.started");
  return started?.type === "activity.started" ? started.payload.activityId : null;
};

/**
"What are you doing?" and ▶ on one line: Enter starts it at once with the words as typed (a
length in them as the Expect); the assistant's reading of it follows in the background.
*/
const TypedStart = () => {
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
    const reading = activityId === null ? null : await assistant.readActivity(typed);
    if (activityId !== null && reading !== null) {
      await actions.refineActivity(activityId, { ...reading, typed });
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
A big button in its fixed place: icon over name, its color's outline, lime while it runs.
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
        className="absolute right-0.5 top-0.5 h-6 w-6 items-center justify-center rounded-md active:opacity-60"
        hitSlop={4}
        onPress={more}
      >
        <Ellipsis color={palette.muted} size={14} />
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
  const { more, tap } = useTap(setOpened);
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="gap-2 border-t border-line bg-bg px-3 pb-2.5 pt-2.5"
      role="region"
    >
      {[...(running === null ? [] : [running]), ...alongside].map((item) => (
        <RunningRow key={item.activityId} running={item} />
      ))}
      <TypedStart />
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
