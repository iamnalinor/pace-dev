import { useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { Composer } from "#app/features/now/composer/composer.tsx";
import { FoldedSection, TaskRows } from "#app/shared/task-list.tsx";
import { TimeBar } from "#app/shared/tracking/time-bar.tsx";
import { ZoneBanner } from "#app/shared/zone-banner.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Screen } from "#app/ui/screen.tsx";

import { CalendarPrompt } from "./calendar-prompt.tsx";
import { NowHeader } from "./now-header.tsx";
import { ProjectChips } from "./project-chips.tsx";

/**
The Main artboard: open tasks by deadline, the nearest first; the composer on top (shared text
lands there), the tasks that start later folded under "In future", and the time bar where the
thumb rests.
*/
export const NowBoard = ({ composeText }: { readonly composeText?: string | undefined }) => {
  const t = useT();
  const { hooks } = usePace();
  const [projectId, setProjectId] = useState<null | string>(null);
  const board = hooks.useNow(projectId === null ? undefined : { projectId });
  const isEmpty = board.rows.length === 0 && board.future.length === 0;
  return (
    <Screen footer={<TimeBar />} header={<NowHeader inboxCount={board.inboxCount} />}>
      {/* On /add (New task, the "+" tab, a share) the cursor is in the composer. */}
      <Composer
        initialText={composeText}
        isFocused={composeText !== undefined}
        key={composeText ?? ""}
      />
      <ZoneBanner />
      <CalendarPrompt />
      <ProjectChips chips={board.projects} onSelect={setProjectId} selected={projectId} />
      {isEmpty ? <EmptyState>{t("now.empty")}</EmptyState> : null}
      <TaskRows label={t("now.tasks")} rows={board.rows} />
      <FoldedSection count={board.future.length} title={t("now.future")}>
        <TaskRows label={t("now.future")} rows={board.future} />
      </FoldedSection>
    </Screen>
  );
};
