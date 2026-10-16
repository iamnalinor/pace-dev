import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { TaskRows } from "#app/shared/task-list.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { groupNowRows, type NowRow } from "@pace/client";

const PREVIEW_COUNT = 3;

/** A small preview of one kind of task, expanded without hiding the other kind. */
const TaskGroup = ({
  rows,
  title,
}: {
  readonly rows: readonly NowRow[];
  readonly title: string;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = rows.length > PREVIEW_COUNT;
  const shown = isExpanded ? rows : rows.slice(0, PREVIEW_COUNT);
  return (
    <View className="mx-3 overflow-hidden rounded-xl border border-line bg-surface">
      <View className="min-h-11 flex-row items-center justify-between border-b border-line px-3">
        <Text className="font-sans text-[13px] font-semibold text-fg2">{title}</Text>
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-[12px] tabular-nums text-muted">{rows.length}</Text>
          {canExpand ? (
            <Pressable
              accessibilityLabel={t(isExpanded ? "now.collapseGroup" : "now.expandGroup", {
                title,
              })}
              accessibilityRole="button"
              aria-expanded={isExpanded}
              className="min-h-11 flex-row items-center gap-1 px-1"
              onPress={() => {
                setIsExpanded((current) => !current);
              }}
            >
              <Text className="font-sans text-[12px] font-medium text-fg2">
                {t(isExpanded ? "now.collapse" : "now.expand")}
              </Text>
              {isExpanded ? (
                <ChevronUp color={palette.muted} size={15} />
              ) : (
                <ChevronDown color={palette.muted} size={15} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      <TaskRows animateLayout={false} label={title} rows={shown} />
    </View>
  );
};

/** A single plain list, or two compact groups when both kinds are present. */
export const NowTaskGroups = ({ rows }: { readonly rows: readonly NowRow[] }) => {
  const t = useT();
  const { dated, undated } = groupNowRows(rows);
  if (dated.length === 0 || undated.length === 0) {
    return (
      <TaskRows
        animateLayout={false}
        label={t("now.tasks")}
        rows={dated.length === 0 ? undated : dated}
      />
    );
  }
  return (
    <View className="gap-3">
      <TaskGroup rows={dated} title={t("now.withDeadline")} />
      <TaskGroup rows={undated} title={t("now.withoutDeadline")} />
    </View>
  );
};
