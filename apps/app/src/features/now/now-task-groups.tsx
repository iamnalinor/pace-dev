import { useState } from "react";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { TaskRows } from "#app/shared/task-list.tsx";
import { Disclosure } from "#app/ui/disclosure.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { groupNowRows, type NowRow } from "@pace/client";

const PREVIEW_COUNT = 3;

/** A small preview of one kind of task; "Show all" unfolds the rest without hiding the other kind. */
const TaskGroup = ({
  rows,
  title,
}: {
  readonly rows: readonly NowRow[];
  readonly title: string;
}) => {
  const t = useT();
  const [isExpanded, setIsExpanded] = useState(false);
  const rest = rows.slice(PREVIEW_COUNT);
  return (
    <View>
      <SectionHeader count={rows.length} title={title} />
      <TaskRows animateLayout={false} label={title} rows={rows.slice(0, PREVIEW_COUNT)} />
      {rest.length === 0 ? null : (
        <Disclosure
          count={rest.length}
          label={t("now.showAll")}
          onToggle={() => {
            setIsExpanded(!isExpanded);
          }}
          open={isExpanded}
        >
          <TaskRows animateLayout={false} label={title} rows={rest} />
        </Disclosure>
      )}
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
    <View>
      <TaskGroup rows={dated} title={t("now.withDeadline")} />
      <TaskGroup rows={undated} title={t("now.withoutDeadline")} />
    </View>
  );
};
