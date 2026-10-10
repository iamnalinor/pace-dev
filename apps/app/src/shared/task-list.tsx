import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { NowRow } from "@pace/client";

import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { useOpenTask } from "./task-opener.tsx";
import { TaskRow } from "./task-row.tsx";
import { useCheckTask } from "./use-check-task.ts";

/** A list of task rows: tap to open, the check to close. */
export const TaskRows = ({
  checked = false,
  label,
  rows,
  withTag = true,
}: {
  /** Closed tasks: checked rows that open the task (reopen is there). */
  readonly checked?: boolean;
  readonly label: string;
  readonly rows: readonly NowRow[];
  readonly withTag?: boolean;
}) => {
  const openTask = useOpenTask();
  const check = useCheckTask();
  return (
    <View aria-label={label} className="px-2" role="list">
      {rows.map((row) => (
        <Animated.View
          entering={ROW_ENTER}
          exiting={ROW_EXIT}
          key={row.id}
          layout={ROW_LAYOUT}
          role="listitem"
        >
          <TaskRow
            checked={checked}
            onOpen={() => {
              openTask(row.id);
            }}
            row={row}
            withTag={withTag}
            {...(!checked && {
              onCheck: () => {
                check(row);
              },
            })}
          />
        </Animated.View>
      ))}
    </View>
  );
};

/**
A section folded by default under its title and count ("In future · 3", "Done · 11"): the same
chevron as every other disclosure.
*/
export const FoldedSection = ({
  children,
  count,
  initiallyOpen = false,
  title,
}: {
  readonly children: React.ReactNode;
  readonly count: number;
  readonly initiallyOpen?: boolean;
  readonly title: string;
}) => {
  const { palette } = useTheme();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  if (count === 0) {
    return null;
  }
  const Icon = isOpen ? ChevronUp : ChevronDown;
  return (
    <View className="mt-2">
      <Pressable
        accessibilityRole="button"
        aria-expanded={isOpen}
        className="mx-3 h-11 flex-row items-center gap-1.5 border-t border-line px-2 active:opacity-70"
        onPress={() => {
          setIsOpen(!isOpen);
        }}
      >
        <Text className="font-sans text-[13px] font-medium text-fg2">{`${title} · ${String(count)}`}</Text>
        <Icon color={palette.muted} size={16} strokeWidth={2} />
      </Pressable>
      {isOpen ? children : null}
    </View>
  );
};
