import { useState } from "react";
import { Text, View } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { Screen } from "#app/ui/screen.tsx";

import type { CloseMode } from "./close-model.ts";

import { CloseSheet } from "./close-sheet.tsx";
import { ProblemsList } from "./problems-list.tsx";
import { ProjectSheet } from "./project-sheet.tsx";
import { SourceText } from "./source-text.tsx";
import { TaskFooter } from "./task-footer.tsx";
import { TaskHeader } from "./task-header.tsx";
import { EditTaskSheet } from "./task-sheets.tsx";
import { TaskSummary } from "./task-summary.tsx";
import { WorkProgress } from "./work-progress.tsx";

/** Delete opens the close sheet on Cancelled · Skipped. */
const CLOSE_AS: CloseMode = "other";

type Open = "close" | "close-as" | "edit" | "project" | null;

const TaskBody = ({ view }: { readonly view: TaskViewModel }) => (
  <View className="gap-5 pt-1">
    <TaskSummary view={view} />
    {view.description === null || view.description === "" ? null : (
      <Text className="px-5 font-sans text-[14px] leading-5 text-fg2">{view.description}</Text>
    )}
    <WorkProgress view={view} />
    <ProblemsList view={view} />
    <SourceText text={view.sourceText} />
  </View>
);

/** The sheet over the task, if one is open: close, edit or project. */
const OpenSheet = ({
  onDismiss: dismiss,
  open,
  view: task,
}: {
  readonly open: Open;
  readonly view: TaskViewModel;
  readonly onDismiss: () => void;
}) => (
  <>
    {open === "close" || open === "close-as" ? (
      <CloseSheet
        onClose={dismiss}
        {...(open === "close-as" && { startMode: CLOSE_AS })}
        view={task}
      />
    ) : null}
    {open === "edit" ? <EditTaskSheet onClose={dismiss} view={task} /> : null}
    {open === "project" ? <ProjectSheet onClose={dismiss} view={task} /> : null}
  </>
);

/**
The task (artboards 2 and 3): summary, progress or problems, the source text; the footer
holds Focus and Done / Submit.
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
              actions={{
                onDelete: () => {
                  setOpen("close-as");
                },
                onEdit: () => {
                  setOpen("edit");
                },
                view: task,
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
      <OpenSheet onDismiss={dismiss} open={open} view={task} />
    </>
  );
};
