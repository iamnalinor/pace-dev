import { Plus, Square } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  type ActivityButtonProps,
  PACE_STATUS_TEXT,
  type RunningView,
  type TimeButtonView,
} from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ColorTag, inkClass, PROJECT_FILL, washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatDuration } from "@pace/core";

import { ButtonEditor, type EditorTarget } from "./button-editor.tsx";

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
          <ColorTag color={running.color}>{running.label}</ColorTag>
          <Text className="font-mono text-[13px] text-fg">
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

const ActivityButton = ({ button, onEdit, onTap }: ActivityButtonProps) => {
  const t = useT();
  const edit = (): void => {
    onEdit({ button, kind: "edit" });
  };
  return (
    <Pressable
      accessibilityActions={[
        { label: t("time.editButton", { label: button.label }), name: "longpress" },
      ]}
      accessibilityHint={t("time.buttonHint")}
      accessibilityLabel={button.label}
      accessibilityRole="button"
      accessibilityState={{ selected: button.isRunning }}
      className={cx(
        "h-11 w-[23.5%] items-center justify-center rounded-lg border px-1 active:opacity-80",
        button.isRunning ? PROJECT_FILL[button.color] : washClass(button.color),
      )}
      delayLongPress={450}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") {
          edit();
        }
      }}
      onLongPress={edit}
      onPress={() => {
        onTap(button);
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
    </Pressable>
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
  const bar = hooks.useTimeBar();
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const tap = (button: TimeButtonView): void => {
    void run(actions.tapButton(button.id), {
      success: t(button.toast.key, button.toast.params),
      undo: true,
    });
  };
  return (
    <View
      accessibilityLabel={t("time.bar")}
      className="border-t border-line bg-bg px-3 pb-2.5 pt-2.5"
    >
      <View className="min-h-9 flex-row items-center gap-2">
        <View className="flex-1">
          {bar.running === null ? (
            <Text className="font-sans text-[12px] text-muted">{t("time.idle")}</Text>
          ) : (
            <RunningRow
              onStop={() => {
                void run(actions.stopActivity(), {
                  success: t("time.stopped", { label: bar.running?.label ?? "" }),
                  undo: true,
                });
              }}
              running={bar.running}
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
      <View className="mt-2 flex-row flex-wrap gap-[2%]">
        {bar.buttons.map((button) => (
          <ActivityButton button={button} key={button.id} onEdit={setEditing} onTap={tap} />
        ))}
      </View>
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
