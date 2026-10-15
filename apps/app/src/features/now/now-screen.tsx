import { useState } from "react";

import type { NowRow } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { Composer } from "#app/features/now/composer/composer.tsx";
import { FoldedSection, TaskRows } from "#app/shared/task-list.tsx";
import { ZoneBanner } from "#app/shared/zone-banner.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Screen } from "#app/ui/screen.tsx";

import { CalendarPrompt } from "./calendar-prompt.tsx";
import { NowHeader } from "./now-header.tsx";
import { ProjectChips } from "./project-chips.tsx";
import { RunningNow } from "./running-now.tsx";

/**
The Main artboard: open tasks by deadline, the nearest first; the composer on top (shared text
lands there), what runs now in a compact row under it, and the tasks that start later folded
under "In future". The time bar itself is on Day. The composer's state comes from the
`ComposerProvider` around Now.
*/
export const NowBoard = ({
  isComposerFocused = false,
}: {
  readonly isComposerFocused?: boolean;
}) => {
  const t = useT();
  const { hooks } = usePace();
  const [projectId, setProjectId] = useState<null | string>(null);
  const board = hooks.useNow();
  // A filter whose project has nothing open any more lets go, or the list would stay empty.
  const selected = board.projects.some((chip) => chip.id === projectId) ? projectId : null;
  const isInProject = (row: NowRow): boolean => selected === null || row.projectId === selected;
  const rows = board.rows.filter((row) => isInProject(row));
  const future = board.future.filter((row) => isInProject(row));
  const isEmpty = rows.length === 0 && future.length === 0;
  return (
    <Screen header={<NowHeader />}>
      {/* On /add (a share) the cursor is in the composer. */}
      <Composer isFocused={isComposerFocused} />
      <RunningNow />
      <ZoneBanner />
      <CalendarPrompt />
      <ProjectChips chips={board.projects} onSelect={setProjectId} selected={selected} />
      {isEmpty ? <EmptyState>{t("now.empty")}</EmptyState> : null}
      <TaskRows label={t("now.tasks")} rows={rows} />
      <FoldedSection count={future.length} title={t("now.future")}>
        <TaskRows label={t("now.future")} rows={future} />
      </FoldedSection>
    </Screen>
  );
};
