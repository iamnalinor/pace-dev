import { useState } from "react";
import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Screen } from "#app/ui/screen.tsx";

import type { CloseMode } from "./close-model.ts";

import { CloseSheet } from "./close-sheet.tsx";
import { ProblemsList } from "./problems-list.tsx";
import { SourceText } from "./source-text.tsx";
import { TaskFooter } from "./task-footer.tsx";
import { TaskHeader } from "./task-header.tsx";
import { ProjectSheet } from "./project-sheet.tsx";
import { EditTextSheet, TaskMenuSheet } from "./task-sheets.tsx";
import { TaskSummary } from "./task-summary.tsx";
import { WhyCard } from "./why-card.tsx";
import { WorkProgress } from "./work-progress.tsx";

/** "Close as…" from the menu opens on Cancelled · Skipped. */
const CLOSE_AS: CloseMode = "other";

type Open = "close" | "close-as" | "edit" | "menu" | "project" | null;

const TaskBody = ({ view }: { readonly view: TaskViewModel }) => {
  const { hooks } = usePace();
  const place = hooks.useNow().rows.findIndex((row) => row.id === view.id);
  return (
    <View className="gap-5 pt-1">
      <TaskSummary view={view} />
      {view.description === null || view.description === "" ? null : (
        <Text className="px-5 font-sans text-[14px] leading-5 text-fg2">{view.description}</Text>
      )}
      <WorkProgress view={view} />
      <ProblemsList view={view} />
      {view.closed === null ? <WhyCard place={place} view={view} /> : null}
      <SourceText text={view.sourceText} />
    </View>
  );
};

/**
The task (artboards 2 and 3): summary, progress or problems, why it sits where it does on
Now, the source text; the footer holds the status buttons and Done / Submit.
*/
export const TaskScreen = ({
  id,
  openClose = false,
}: {
  readonly id: string;
  /** Lands with the close sheet open (a per-problem check on Now). */
  readonly openClose?: boolean;
}) => {
  const t = useT();
  const { hooks } = usePace();
  const view = hooks.useTaskView(id);
  const [open, setOpen] = useState<Open>(openClose ? "close" : null);
  if (!view.ok) {
    return (
      <Screen header={<TaskHeader project={null} />}>
        <EmptyState>{t("task.notFound")}</EmptyState>
      </Screen>
    );
  }
  const task = view.value;
  const dismiss = (): void => {
    setOpen(null);
  };
  const isCovered = open !== null;
  return (
    <>
      <View
        accessibilityElementsHidden={isCovered}
        className="flex-1"
        importantForAccessibility={isCovered ? "no-hide-descendants" : "auto"}
      >
        <Screen
          footer={
            <TaskFooter
              onClose={() => {
                setOpen("close");
              }}
              view={task}
            />
          }
          header={
            <TaskHeader
              onMenu={() => {
                setOpen("menu");
              }}
              onProject={() => {
                setOpen("project");
              }}
              project={task.project}
            />
          }
        >
          <TaskBody view={task} />
        </Screen>
      </View>
      {open === "close" || open === "close-as" ? (
        <CloseSheet
          onClose={dismiss}
          {...(open === "close-as" && { startMode: CLOSE_AS })}
          view={task}
        />
      ) : null}
      {open === "menu" ? <TaskMenuSheet onChoose={setOpen} onClose={dismiss} view={task} /> : null}
      {open === "edit" ? <EditTextSheet onClose={dismiss} view={task} /> : null}
      {open === "project" ? <ProjectSheet onClose={dismiss} view={task} /> : null}
    </>
  );
};
