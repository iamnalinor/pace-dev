import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { NowRow } from "@pace/client";

import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { RowList } from "#app/ui/row-list.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { useOpenTask } from "./task-opener.tsx";
import { TaskRow } from "./task-row.tsx";
import { useCheckTask } from "./use-check-task.ts";

/** The ids that `isKept` approves; the same set when nothing is dropped, so no render follows. */
const keeping = (
  ids: ReadonlySet<string>,
  isKept: (id: string) => boolean,
): ReadonlySet<string> => {
  const kept = [...ids].filter((id) => isKept(id));
  return kept.length === ids.size ? ids : new Set(kept);
};

/** A list of task rows: tap to open, the check to close. */
export const TaskRows = ({
  animateLayout = true,
  checked = false,
  label,
  rows,
  withTag = true,
}: {
  readonly animateLayout?: boolean;
  /** Closed tasks: checked rows that open the task (reopen is there). */
  readonly checked?: boolean;
  readonly label: string;
  readonly rows: readonly NowRow[];
  readonly withTag?: boolean;
}) => {
  const openTask = useOpenTask();
  const { check, opensSheet } = useCheckTask();
  // Rows turning to dust after their check; each closes once its dust has gone.
  const [dissolving, setDissolving] = useState<ReadonlySet<string>>(() => new Set());
  // Rows whose dust has gone: they leave the list at once, so the rows below move up as the
  // dust ends, not after the close has been written. A refused close brings the row back.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Once the store has dropped a row, forget it: closed again later (undone, then checked
  // again), it dissolves anew. Adjusted while rendering, not in an effect, to skip a stale frame.
  const present = rows.map((row) => row.id).join("\n");
  const [seen, setSeen] = useState(present);
  if (seen !== present) {
    const ids = new Set(rows.map((row) => row.id));
    setSeen(present);
    setDissolving((current) => keeping(current, (id) => ids.has(id)));
    setGone((current) => keeping(current, (id) => ids.has(id)));
  }
  const settle = async (row: NowRow): Promise<void> => {
    setGone((current) => new Set([...current, row.id]));
    if (await check(row)) {
      return;
    }

    setGone((current) => keeping(current, (id) => id !== row.id));
    setDissolving((current) => keeping(current, (id) => id !== row.id));
  };
  return (
    <RowList aria-label={label} className="px-2" role="list">
      {rows
        .filter((row) => !gone.has(row.id))
        .map((row) => (
          <Animated.View
            entering={ROW_ENTER}
            key={row.id}
            // The dust is the exit of a checked row; the fade would only bring it back for a moment.
            {...(!dissolving.has(row.id) && { exiting: ROW_EXIT })}
            layout={animateLayout ? ROW_LAYOUT : undefined}
            role="listitem"
          >
            <TaskRow
              checked={checked}
              isDissolving={dissolving.has(row.id)}
              onDissolved={() => {
                void settle(row);
              }}
              onOpen={() => {
                openTask(row.id);
              }}
              row={row}
              withTag={withTag}
              {...(!checked && {
                onCheck: () => {
                  if (opensSheet(row)) {
                    void check(row);
                  } else {
                    setDissolving((current) => new Set([...current, row.id]));
                  }
                },
              })}
            />
          </Animated.View>
        ))}
    </RowList>
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
