import type { ReactNode } from "react";

import { useRouter } from "expo-router";

import type { SharedIn } from "#app/platform/shared-line.ts";

import { useAppState, useT } from "#app/app-state.tsx";
import { ComposerProvider, useComposerFlow } from "#app/features/now/composer/composer-flow.tsx";
import { ComposerPane } from "#app/features/now/composer/composer-pane.tsx";
import { NowBoard } from "#app/features/now/now-screen.tsx";
import { TaskScreen } from "#app/features/task/task-screen.tsx";
import { useLineDraftNote } from "#app/platform/shared-in.ts";
import { TaskOpenerProvider, TaskPaneProvider } from "#app/shared/task-opener.tsx";
import { useSearchParam } from "#app/shared/use-search-param.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { Shell } from "#app/ui/shell.tsx";

/**
The task open beside the list, from the address (`?task=<id>`, feedback 5 item 6): a reload, a
link and the browser's history open the same one. An id the store does not know (a deleted task,
a mistyped link, the log still loading) leaves the pane closed and the address as it is: nothing
is written back, so nothing loops (bug-lessons 1).
*/
const usePickedTask = (): readonly [null | string, (taskId: null | string) => void] => {
  const [taskId, setTaskId] = useSearchParam("task");
  const isKnown = useAppState(
    (state) => taskId !== null && Object.hasOwn(state.tasks.byId, taskId),
  );
  return [taskId !== null && isKnown ? taskId : null, setTaskId];
};

/** The inspector's task: the picked one, with its pane's close. */
const PickedTask = ({
  onClose,
  picked,
}: {
  readonly picked: string;
  readonly onClose: () => void;
}) => (
  <TaskPaneProvider onClose={onClose}>
    <TaskScreen id={picked} key={picked} />
  </TaskPaneProvider>
);

/**
On a wide window the picked task opens in the shell's inspector, and so does the task form: while
it is open the inspector holds it, collapsed when there is neither, and closing it (or adding the task) brings
the picked task back. Picking a task while the form is open closes it: its draft goes, the
line keeps its text.
*/
const NowSplit = ({
  isComposerFocused,
  onPick,
  picked,
}: {
  readonly isComposerFocused: boolean;
  readonly picked: null | string;
  readonly onPick: (picked: null | string) => void;
}) => {
  const t = useT();
  const flow = useComposerFlow();
  // The inspector opens with the form or a pick and is collapsed otherwise (F-LAY-03).
  let inspector: ReactNode;
  if (flow.form !== null) {
    inspector = <ComposerPane />;
  } else if (picked !== null) {
    inspector = (
      <PickedTask
        onClose={() => {
          onPick(null);
        }}
        picked={picked}
      />
    );
  }
  return (
    <TaskOpenerProvider
      open={(id) => {
        flow.hide();
        onPick(id);
      }}
      selectedId={flow.form === null ? picked : null}
    >
      <Shell
        content={<NowBoard isComposerFocused={isComposerFocused} />}
        inspector={inspector}
        inspectorLabel={t("now.details")}
        inspectorOpen={inspector !== undefined}
      />
    </TaskOpenerProvider>
  );
};

/** Tells the share target what the line holds as it is typed (QA round 19 L4, round 6 M3). */
const LineDraftNote = () => {
  const { model, text } = useComposerFlow();
  // The line's text, or the title typed into an open New task form (the phone's bare Add tab).
  useLineDraftNote(text.trim() === "" ? model.title : text);
  return null;
};

/**
Now on a phone; on a wide window the list with the picked task (or the task form) beside it.
`compose` is a share arriving on /add (or handed on to "/"); the composer is keyed by its arrival,
so each share fills the line, the same text again included.
*/
export const NowScreen = ({
  compose,
  lineDraftKey = "now.line",
  notesLineDraft = false,
  opensForm = false,
}: {
  readonly compose?: SharedIn | undefined;
  /** Where the line's unsent text is kept: Now's own, or the Add tab's (feedback 5 item 7). */
  readonly lineDraftKey?: string;
  /** The line a share goes after (Now at "/" on the web, the Add tab on a phone) tells what it holds. */
  readonly notesLineDraft?: boolean;
  /** New task arriving on /add: the empty form opens at once. */
  readonly opensForm?: boolean;
}) => {
  const router = useRouter();
  const isWide = useIsWide();
  const [picked, setPicked] = usePickedTask();
  const isComposerFocused = compose !== undefined;
  return (
    <ComposerProvider
      initialText={compose?.text}
      isFormInPane={isWide}
      key={compose === undefined ? "now" : `share-${compose.seq}`}
      lineDraftKey={lineDraftKey}
      onCreatedTask={(taskId) => {
        if (isWide) {
          setPicked(taskId);
        } else {
          router.push(`/task/${taskId}`);
        }
      }}
      opensForm={opensForm}
    >
      {notesLineDraft ? <LineDraftNote /> : null}
      {isWide ? (
        <NowSplit isComposerFocused={isComposerFocused} onPick={setPicked} picked={picked} />
      ) : (
        <NowBoard isComposerFocused={isComposerFocused} />
      )}
    </ComposerProvider>
  );
};
