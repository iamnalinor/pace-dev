import { Pressable, Text, View } from "react-native";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { cx } from "#app/ui/cx.ts";

import { MetaLine } from "./meta-line.tsx";
import { useSelectedTask } from "./task-opener.tsx";

/**
A task as every list shows it (Now, a project's open and done lists, History): the check, the
title, then the project (or category) and the importance as tags with the meta line.
*/
export const TaskRow = ({
  asOf,
  checked = false,
  onCheck,
  onOpen,
  row,
  withTag = true,
}: {
  /** History's moment: relative words count from it. */
  readonly asOf?: string;
  /** A closed task: the check is filled and the title muted. */
  readonly checked?: boolean;
  /** Without it the check is read-only. */
  readonly onCheck?: () => void;
  readonly onOpen: () => void;
  readonly row: NowRow;
  /** The project page leaves the project's own tag out. */
  readonly withTag?: boolean;
}) => {
  const t = useT();
  const isSelected = useSelectedTask() === row.id;
  return (
    <View className={cx("flex-row gap-3 rounded-lg py-3 pl-3 pr-3", isSelected && "bg-raised")}>
      <CheckCircle
        checked={checked}
        label={t("now.markDone", { title: row.title })}
        {...(onCheck !== undefined && { onPress: onCheck })}
      />
      <Pressable
        accessibilityRole="link"
        aria-current={isSelected ? "page" : undefined}
        className="flex-1 gap-[5px] active:opacity-70"
        onPress={onOpen}
      >
        <Text
          className={cx(
            "font-sans text-[15px]",
            checked || row.dimmed ? "text-fg2" : "font-medium text-fg",
            checked && "line-through",
          )}
          numberOfLines={2}
        >
          {row.title}
        </Text>
        <MetaLine asOf={asOf} parts={row.meta} tag={withTag ? row : null} />
      </Pressable>
    </View>
  );
};
