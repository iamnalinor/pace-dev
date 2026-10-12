import { Pressable, Text, View } from "react-native";

import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { cx } from "#app/ui/cx.ts";
import { Dissolve } from "#app/ui/dissolve.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { MetaLine } from "./meta-line.tsx";
import { useSelectedTask } from "./task-opener.tsx";

/** The title: muted and struck through once closed, quiet for an undated Nice-to-have. */
const RowTitle = ({
  isChecked,
  isDimmed,
  title,
}: {
  readonly isChecked: boolean;
  readonly isDimmed: boolean;
  readonly title: string;
}) => (
  <Text
    className={cx(
      "font-sans text-[15px]",
      isChecked || isDimmed ? "text-fg2" : "font-medium text-fg",
      isChecked && "line-through",
    )}
    numberOfLines={2}
  >
    {title}
  </Text>
);

const NOTHING = (): void => undefined;

/**
A task as every list shows it (Now, a project's open and done lists, History): the check, the
title, then the project (or category) and the importance as tags with the meta line.
*/
export const TaskRow = ({
  asOf,
  checked = false,
  isDissolving = false,
  onCheck,
  onDissolved,
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
  /** Just checked: the row turns to dust, then `onDissolved` closes it. */
  readonly isDissolving?: boolean;
  readonly onDissolved?: () => void;
  readonly onOpen: () => void;
  readonly row: NowRow;
  /** The project page leaves the project's own tag out. */
  readonly withTag?: boolean;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const isSelected = useSelectedTask() === row.id;
  return (
    <Dissolve color={palette.fg2} isActive={isDissolving} onDone={onDissolved ?? NOTHING}>
      <View className={cx("flex-row gap-3 rounded-lg py-3 pl-3 pr-3", isSelected && "bg-raised")}>
        <CheckCircle
          checked={checked || isDissolving}
          label={t("now.markDone", { title: row.title })}
          {...(onCheck !== undefined && { onPress: onCheck })}
        />
        <Pressable
          accessibilityRole="link"
          aria-current={isSelected ? "page" : undefined}
          className="flex-1 gap-[5px] active:opacity-70"
          onPress={onOpen}
        >
          <RowTitle isChecked={checked} isDimmed={row.dimmed} title={row.title} />
          <MetaLine asOf={asOf} parts={row.meta} tag={withTag ? row : null} />
        </Pressable>
      </View>
    </Dissolve>
  );
};
