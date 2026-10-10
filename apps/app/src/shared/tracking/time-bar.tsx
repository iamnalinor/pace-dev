import { ChevronDown, Plus, Square } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Chip } from "#app/ui/chip.tsx";
import { ColorTag, inkClass, OUTLINE, PROJECT_FILL } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { PulseDot } from "#app/ui/pulse-dot.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import {
  PACE_STATUS_TEXT,
  recentLabels,
  type RunningView,
  type TimeButtonView,
} from "@pace/client";
import { formatDuration } from "@pace/core";

import { ButtonEditor, type EditorTarget } from "./button-editor.tsx";
import { DetailsSheet } from "./details-sheet.tsx";

const percent = (share: number): `${number}%` => `${Math.round(share * 100)}%`;

const RunningRow = ({
  onStop,
  running,
}: {
  readonly running: RunningView;
  readonly onStop: () => void;
}) => {
  const t = useT();
  const { language } = useViewer();
  const { palette } = useTheme();
  const target = running.expectMinutes ?? running.limitMinutes;
  const isOver = running.status === "over-limit" || running.status === "over-expect";
  const statusKey = PACE_STATUS_TEXT[running.status];
  return (
    <View className="flex-row items-center gap-2.5">
      <View accessibilityLiveRegion="polite" className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <PulseDot className={PROJECT_FILL[running.color]} />
          <ColorTag color={running.color}>{running.label}</ColorTag>
          <Text className="font-sans text-[13px] tabular-nums text-fg">
            {formatDuration(running.minutes, language)}
          </Text>
          {target === null ? null : (
            <Text className="font-sans text-[12px] text-muted">
              {t(running.expectMinutes === null ? "time.limitOf" : "time.expectOf", {
                duration: formatDuration(target, language),
              })}
            </Text>
          )}
          {statusKey === null ? null : (
            <Text
              className={cx(
                "font-sans text-[12px] font-medium",
                isOver ? "text-warn" : "text-question",
              )}
            >
              {t(statusKey)}
            </Text>
          )}
        </View>
        {running.share === null ? null : (
          <View className="h-1 overflow-hidden rounded-full bg-track">
            <View
              className={cx(
                "h-full rounded-full",
                isOver ? "bg-warn" : PROJECT_FILL[running.color],
              )}
              style={{ width: percent(running.share) }}
            />
          </View>
        )}
      </View>
      <Pressable
        accessibilityLabel={t("time.stop")}
        accessibilityRole="button"
        className="h-9 flex-row items-center gap-1.5 rounded-lg border border-line px-3 active:opacity-70"
        hitSlop={6}
        onPress={onStop}
      >
        <Square color={palette.fg} size={14} />
        <Text className="font-sans text-[13px] text-fg">{t("time.stop")}</Text>
      </Pressable>
    </View>
  );
};

type ButtonProps = {
  readonly button: TimeButtonView;
  readonly onTap: (button: TimeButtonView) => void;
  readonly onDetails: (button: TimeButtonView) => void;
};

/**
A compact activity chip: the surface in its color's outline, filled while it runs. A button
that asks for details (a chevron) opens them on a tap; any opens them on a long press.
*/
const ActivityButton = ({ button, onDetails, onTap }: ButtonProps) => {
  const t = useT();
  const { palette } = useTheme();
  const details = (): void => {
    onDetails(button);
  };
  const isAsks = button.shouldAskDetails && !button.isRunning;
  return (
    <Pressable
      accessibilityActions={[{ label: t("time.details.what"), name: "longpress" }]}
      accessibilityHint={t("time.buttonHint")}
      accessibilityLabel={button.label}
      accessibilityRole="switch"
      aria-checked={button.isRunning}
      className={cx(
        "h-10 flex-row items-center gap-1 rounded-pill border-2 px-3.5 active:opacity-80",
        OUTLINE[button.color],
        button.isRunning ? PROJECT_FILL[button.color] : "bg-surface",
      )}
      delayLongPress={450}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") {
          details();
        }
      }}
      onLongPress={details}
      onPress={() => {
        if (isAsks) {
          details();
        } else {
          onTap(button);
        }
      }}
    >
      <Text
        className={cx(
          "font-sans text-[13px]",
          button.isRunning ? "font-medium text-accentFg" : inkClass(button.color),
        )}
        numberOfLines={1}
      >
        {button.label}
      </Text>
      {isAsks ? <ChevronDown color={palette.muted} size={14} strokeWidth={2} /> : null}
    </Pressable>
  );
};

/** "What are you doing?": a free line that starts at Enter, and the last few labels at a tap. */
const TypedStart = () => {
  const t = useT();
  const { actions } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const time = useAppState((state) => state.time);
  const recent = useMemo(() => recentLabels(time, undefined, 3), [time]);
  const [text, setText] = useState("");
  const start = async (label: string): Promise<void> => {
    if (await run(actions.startTyped(label))) {
      setText("");
    }
  };
  return (
    <View className="gap-2">
      <TextInput
        accessibilityLabel={t("time.whatDoing")}
        className="h-10 rounded-lg border border-line bg-surface px-3 font-sans text-[14px] text-fg"
        onChangeText={setText}
        onSubmitEditing={() => {
          if (text.trim() !== "") {
            void start(text);
          }
        }}
        placeholder={t("time.whatDoing")}
        placeholderTextColor={palette.muted}
        returnKeyType="go"
        value={text}
      />
      {recent.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-1.5">
          {recent.map((label) => (
            <Chip
              key={label}
              label={`${t("time.start")}: ${label}`}
              onPress={() => void start(label)}
            >
              {label}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
};

/**
The time bar under Now, where the thumb rests: one tap on an activity starts it and ends the
running one (a tap on the running one stops it); press and hold to change a button.
*/
export const TimeBar = () => {
  const t = useT();
  const { actions, hooks } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const { buttons, running } = hooks.useTimeBar();
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [details, setDetails] = useState<null | TimeButtonView>(null);
  const tap = (button: TimeButtonView): void => {
    void run(actions.tapButton(button.id));
  };
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="border-t border-line bg-bg px-3 pb-2.5 pt-2.5"
      role="region"
    >
      <View className="min-h-9 flex-row items-center gap-2">
        <View className="flex-1">
          {running === null ? (
            <TypedStart />
          ) : (
            <RunningRow
              onStop={() => {
                void run(actions.stopActivity());
              }}
              running={running}
            />
          )}
        </View>
        <Pressable
          accessibilityLabel={t("time.addButton")}
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-lg active:opacity-70"
          hitSlop={6}
          onPress={() => {
            setEditing({ kind: "new" });
          }}
        >
          <Plus color={palette.fg2} size={18} />
        </Pressable>
      </View>
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        {buttons.map((button) => (
          <ActivityButton button={button} key={button.id} onDetails={setDetails} onTap={tap} />
        ))}
      </View>
      {details === null ? null : (
        <DetailsSheet
          button={details}
          onClose={() => {
            setDetails(null);
          }}
          onEditButton={() => {
            setDetails(null);
            setEditing({ button: details, kind: "edit" });
          }}
        />
      )}
      {editing === null ? null : (
        <ButtonEditor
          onClose={() => {
            setEditing(null);
          }}
          target={editing}
        />
      )}
    </View>
  );
};
