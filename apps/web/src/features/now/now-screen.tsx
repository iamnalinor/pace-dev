import { useSearchParams } from "react-router";

import { useServices } from "#web/app-state.tsx";
import { Composer } from "#web/features/now/composer/composer.tsx";
import { useT } from "#web/i18n.tsx";
import { useCompleteTask } from "#web/shared/task/use-complete-task.ts";
import { ZoneBanner } from "#web/shared/time/zone-banner.tsx";
import { TimeBar } from "#web/shared/tracking/time-bar.tsx";
import { Dock } from "#web/shared/ui/dock.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

import { NowHeaderActions } from "./inbox-counter.tsx";
import { NowList } from "./now-list.tsx";
import { ProjectChips } from "./project-chips.tsx";
import { ReviewLink } from "./review-link.tsx";
import { WaitingSection } from "./waiting-section.tsx";

const PROJECT_PARAM = "project";

type Props = {
  /** `/add` and shared text open Now with the composer filled in and expanded. */
  readonly composeText?: string | undefined;
  readonly isComposerExpanded?: boolean | undefined;
};

/**
Artboard 1: what to do now, in score order, filterable by project; the composer on top and
the time bar docked at the bottom (thumb reach).
*/
export const NowScreen = ({ composeText, isComposerExpanded = false }: Props) => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const projectId = params.get(PROJECT_PARAM);
  const board = useServices().hooks.useNow(projectId === null ? undefined : { projectId });
  const complete = useCompleteTask();
  const check = ({ id, title }: { readonly id: string; readonly title: string }): void => {
    void complete({ id, title });
  };
  return (
    <main className="flex flex-1 flex-col pb-4">
      <PageHeader
        action={<NowHeaderActions inboxCount={board.inboxCount} />}
        title={t("nav.now")}
      />
      <Composer
        className="mx-4 mb-3"
        initialText={composeText}
        isInitiallyExpanded={isComposerExpanded}
        key={composeText ?? ""}
      />
      <ZoneBanner />
      <ReviewLink />
      <ProjectChips
        onSelect={(selected) => {
          setParams(selected === null ? {} : { [PROJECT_PARAM]: selected });
        }}
        projects={board.projects}
        selected={projectId}
      />
      <NowList onCheck={check} rows={board.rows} />
      <WaitingSection
        hasActive={board.rows.length > 0}
        laterCount={board.laterCount}
        onCheck={check}
        waiting={board.waiting}
      />
      <Dock>
        <TimeBar />
      </Dock>
    </main>
  );
};
