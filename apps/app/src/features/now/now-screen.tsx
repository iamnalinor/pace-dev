import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { NowRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { Composer } from "#app/features/composer/composer.tsx";
import { TaskRow } from "#app/shared/task-row.tsx";
import { useCheckTask } from "#app/shared/use-check-task.ts";
import { ZoneBanner } from "#app/shared/zone-banner.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Screen } from "#app/ui/screen.tsx";

import { DraggableRow } from "./draggable-row.tsx";
import { NowHeader } from "./now-header.tsx";
import { ProjectChips } from "./project-chips.tsx";
import { categorySteps } from "./reorder.ts";
import { useMoveTask } from "./use-move-task.ts";

/** Stage 3 puts the focus bar here; until then a quiet row says nothing is being timed. */
const NothingRunning = ({ label }: { readonly label: string }) => (
  <View className="mx-4 mb-3 flex-row items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
    <View className="h-2 w-2 rounded-full bg-faint" />
    <Text className="font-sans text-[14px] text-muted">{label}</Text>
  </View>
);

const Rows = ({
  draggable,
  rows,
}: {
  readonly draggable: boolean;
  readonly rows: readonly NowRow[];
}) => {
  const router = useRouter();
  const check = useCheckTask();
  const move = useMoveTask();
  return (
    <View className="px-2">
      {rows.map((row, index) => {
        const item = (
          <TaskRow
            highlighted={draggable && index === 0}
            onCheck={() => {
              check(row);
            }}
            onOpen={() => {
              router.push(`/task/${row.id}`);
            }}
            row={row}
          />
        );
        return draggable ? (
          <DraggableRow
            key={row.id}
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
          <View key={row.id}>{item}</View>
        );
      })}
    </View>
  );
};

/** The Main artboard: what to do next, best first; the composer on top (shared text lands there). */
export const NowScreen = ({ composeText }: { readonly composeText?: string | undefined }) => {
  const t = useT();
  const { hooks } = usePace();
  const [projectId, setProjectId] = useState<null | string>(null);
  const [isWaitingShown, setWaitingShown] = useState(false);
  const board = hooks.useNow(projectId === null ? undefined : { projectId });
  const isEmpty = board.rows.length === 0 && board.waitingCount === 0;
  return (
    <Screen header={<NowHeader inboxCount={board.inboxCount} />}>
      <Composer initialText={composeText} key={composeText ?? ""} />
      <ZoneBanner />
      <NothingRunning label={t("now.nothingRunning")} />
      <ProjectChips chips={board.projects} onSelect={setProjectId} selected={projectId} />
      {isEmpty ? <EmptyState>{t("now.empty")}</EmptyState> : null}
      <Rows draggable rows={board.rows} />
      {board.laterCount + board.waitingCount === 0 ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isWaitingShown }}
          className="min-h-11 justify-center px-5"
          onPress={() => {
            setWaitingShown((shown) => !shown);
          }}
        >
          <Text className="font-sans text-[12px] text-faint">
            {t("now.folded", { later: board.laterCount, waiting: board.waitingCount })}
          </Text>
        </Pressable>
      )}
      {isWaitingShown ? <Rows draggable={false} rows={board.waiting} /> : null}
    </Screen>
  );
};
