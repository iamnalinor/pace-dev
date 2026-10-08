import { useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { NowRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { Composer } from "#app/features/now/composer/composer.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { TaskRow } from "#app/shared/task-row.tsx";
import { TimeBar } from "#app/shared/tracking/time-bar.tsx";
import { useCheckTask } from "#app/shared/use-check-task.ts";
import { ZoneBanner } from "#app/shared/zone-banner.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { Screen } from "#app/ui/screen.tsx";

import { DraggableRow } from "./draggable-row.tsx";
import { NowHeader } from "./now-header.tsx";
import { ProjectChips } from "./project-chips.tsx";
import { categorySteps } from "./reorder.ts";
import { useMoveTask } from "./use-move-task.ts";

const Rows = ({
  draggable,
  label,
  rows,
}: {
  readonly draggable: boolean;
  readonly label: string;
  readonly rows: readonly NowRow[];
}) => {
  const openTask = useOpenTask();
  const check = useCheckTask();
  const move = useMoveTask();
  return (
    <View aria-label={label} className="px-2" role="list">
      {rows.map((row, index) => {
        const item = (
          <TaskRow
            highlighted={draggable && index === 0}
            onCheck={() => {
              check(row);
            }}
            onOpen={() => {
              openTask(row.id);
            }}
            row={row}
          />
        );
        return (
          <Animated.View
            entering={ROW_ENTER}
            exiting={ROW_EXIT}
            key={row.id}
            layout={ROW_LAYOUT}
            role="listitem"
          >
            {draggable ? (
              <DraggableRow
                onDrag={(rowsMoved) => {
                  move(row.id, categorySteps(rows, row.id, rowsMoved));
                }}
                onStep={(step) => {
                  move(row.id, step);
                }}
                testID={`now-row-${row.id}`}
              >
                {item}
              </DraggableRow>
            ) : (
              item
            )}
          </Animated.View>
        );
      })}
    </View>
  );
};

/**
The Main artboard: what to do next, best first; the composer on top (shared text lands there),
the waiting ones under a divider, the later count, and the time bar where the thumb rests.
*/
export const NowBoard = ({ composeText }: { readonly composeText?: string | undefined }) => {
  const t = useT();
  const { hooks } = usePace();
  const [projectId, setProjectId] = useState<null | string>(null);
  const board = hooks.useNow(projectId === null ? undefined : { projectId });
  const isEmpty = board.rows.length === 0 && board.waiting.length === 0;
  return (
    <Screen footer={<TimeBar />} header={<NowHeader inboxCount={board.inboxCount} />}>
      <Composer initialText={composeText} key={composeText ?? ""} />
      <ZoneBanner />
      <ProjectChips chips={board.projects} onSelect={setProjectId} selected={projectId} />
      {isEmpty ? <EmptyState>{t("now.empty")}</EmptyState> : null}
      <Rows draggable label={t("now.tasks")} rows={board.rows} />
      {board.waiting.length > 0 && board.rows.length > 0 ? (
        <Text
          accessibilityRole="header"
          className="mx-5 mt-2 border-t border-line pb-1 pt-3 font-sans text-[13px] text-muted"
        >
          {t("now.waiting")}
        </Text>
      ) : null}
      <Rows draggable={false} label={t("now.waiting")} rows={board.waiting} />
      {board.laterCount > 0 ? (
        <Text className="px-5 pt-1 font-sans text-[12px] text-faint">
          {t("now.later", { count: board.laterCount })}
        </Text>
      ) : null}
    </Screen>
  );
};
