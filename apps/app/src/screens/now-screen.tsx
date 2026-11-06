import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";

import type { SharedIn } from "#app/platform/shared-line.ts";

import { useT } from "#app/app-state.tsx";
import { ComposerProvider, useComposerFlow } from "#app/features/now/composer/composer-flow.tsx";
import { ComposerPane } from "#app/features/now/composer/composer-pane.tsx";
import { NowBoard } from "#app/features/now/now-screen.tsx";
import { TaskScreen } from "#app/features/task/task-screen.tsx";
import { useLineDraftNote } from "#app/platform/shared-in.ts";
import { TaskOpenerProvider, TaskPaneProvider } from "#app/shared/task-opener.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Shell } from "#app/ui/shell.tsx";

type Picked = { readonly id: string; readonly close: boolean };

/** The inspector's task: the picked one, with its pane's close. */
const PickedTask = ({
  onClose,
  picked,
}: {
  readonly picked: Picked;
  readonly onClose: () => void;
}) => (
  <TaskPaneProvider onClose={onClose}>
    <TaskScreen id={picked.id} key={picked.id} openClose={picked.close} />
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
  readonly picked: null | Picked;
  readonly onPick: (picked: null | Picked) => void;
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
  // The check's submit sheet opens once: the form taking the pane over has used it up, so
  // the task coming back after the form does not open the sheet again by itself.
  useEffect(() => {
    if (flow.form !== null && picked?.close === true) {
      onPick({ ...picked, close: false });
    }
  }, [flow.form, onPick, picked]);
  return (
    <TaskOpenerProvider
      open={(id, options) => {
        flow.hide();
        onPick({ close: options?.close === true, id });
      }}
      selectedId={flow.form === null ? (picked?.id ?? null) : null}
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
  notesLineDraft = false,
  opensForm = false,
}: {
  readonly compose?: SharedIn | undefined;
  /** The line a share goes after (Now at "/" on the web, the Add tab on a phone) tells what it holds. */
  readonly notesLineDraft?: boolean;
  /** New task arriving on /add: the empty form opens at once. */
  readonly opensForm?: boolean;
}) => {
  const router = useRouter();
  const isWide = useIsWide();
  const [picked, setPicked] = useState<null | Picked>(null);
  const isComposerFocused = compose !== undefined;
  return (
    <ComposerProvider
      initialText={compose?.text}
      isFormInPane={isWide}
      key={compose === undefined ? "now" : `share-${compose.seq}`}
      onCreatedTask={(taskId) => {
        if (isWide) {
          setPicked({ close: false, id: taskId });
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
