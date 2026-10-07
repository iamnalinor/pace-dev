import { Pressable, Text, View } from "react-native";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { cx } from "#app/ui/cx.ts";
import { Dot } from "#app/ui/dot.tsx";
import { ProgressBar } from "#app/ui/progress-bar.tsx";

import { MetaLine } from "./meta-line.tsx";

/**
A task as the Now and Project lists show it (Main artboard): the check, the coloured dot and
title, the meta line, and the progress bar with the pace marker when pace applies.
*/
export const TaskRow = ({
  highlighted = false,
  onCheck,
  onOpen,
  row,
  withDot = true,
}: {
  readonly highlighted?: boolean;
  readonly onCheck: () => void;
  readonly onOpen: () => void;
  readonly row: NowRow;
  readonly withDot?: boolean;
}) => {
  const t = useT();
  return (
    <View
      className={cx(
        "flex-row gap-3 rounded-lg p-3",
        highlighted && "bg-surface",
        row.dimmed && "opacity-55",
      )}
    >
      <CheckCircle label={t("now.markDone", { title: row.title })} onPress={onCheck} />
      <Pressable
        accessibilityRole="link"
        className="flex-1 gap-[5px] active:opacity-70"
        onPress={onOpen}
      >
        <View className="flex-row items-center gap-2">
          {withDot ? <Dot color={row.color} /> : null}
          <Text
            className={cx("flex-1 font-sans text-[15px] text-fg", !row.dimmed && "font-medium")}
          >
            {row.title}
          </Text>
        </View>
        <MetaLine parts={row.meta} />
        {row.paceExpected === null ? null : (
          <ProgressBar label={t("task.progress")} marker={row.paceExpected} value={row.progress} />
        )}
      </Pressable>
    </View>
  );
};
