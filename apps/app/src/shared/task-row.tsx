import { Pressable, Text, View } from "react-native";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { cx } from "#app/ui/cx.ts";
import { ImportanceEdge } from "#app/ui/importance-edge.tsx";
import { ProgressBar } from "#app/ui/progress-bar.tsx";

import { MetaLine } from "./meta-line.tsx";

/**
A task as the Now and Project lists show it (Main artboard): the importance edge, the check,
the title, the project (or category) and importance as coloured tags with the meta line, and
the progress bar with the pace marker when pace applies.
*/
export const TaskRow = ({
  highlighted = false,
  onCheck,
  onOpen,
  row,
  withTag = true,
}: {
  readonly highlighted?: boolean;
  /** Without it the row is read-only (a past board). */
  readonly onCheck?: () => void;
  readonly onOpen: () => void;
  readonly row: NowRow;
  /** The project page leaves the project's own tag out. */
  readonly withTag?: boolean;
}) => {
  const t = useT();
  return (
    <View className={cx("flex-row gap-3 rounded-lg py-3 pl-1.5 pr-3", highlighted && "bg-surface")}>
      <ImportanceEdge importance={row.importance} />
      {onCheck === undefined ? null : (
        <CheckCircle label={t("now.markDone", { title: row.title })} onPress={onCheck} />
      )}
      <Pressable
        accessibilityRole="link"
        className="flex-1 gap-[5px] active:opacity-70"
        onPress={onOpen}
      >
        <Text
          className={cx("font-sans text-[15px]", row.dimmed ? "text-fg2" : "font-medium text-fg")}
        >
          {row.title}
        </Text>
        <MetaLine parts={row.meta} tag={withTag ? row : null} />
        {row.paceExpected === null ? null : (
          <ProgressBar label={t("task.progress")} marker={row.paceExpected} value={row.progress} />
        )}
      </Pressable>
    </View>
  );
};
