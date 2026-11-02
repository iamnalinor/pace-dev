import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { SharedIn } from "#app/platform/shared-line.ts";

import { useT } from "#app/app-state.tsx";
import { ComposerProvider, useComposerFlow } from "#app/features/now/composer/composer-flow.tsx";
import { ComposerPane } from "#app/features/now/composer/composer-pane.tsx";
import { NowBoard } from "#app/features/now/now-screen.tsx";
import { TaskScreen } from "#app/features/task/task-screen.tsx";
import { useLineDraftNote } from "#app/platform/shared-in.ts";
import { TaskOpenerProvider, TaskPaneProvider } from "#app/shared/task-opener.tsx";
import { useIsWide } from "#app/ui/layout.ts";

type Picked = { readonly id: string; readonly close: boolean };

/** The pane beside the list when no form is open: the picked task, or how to pick one. */
const PickedTask = ({
  onClose,
  picked,
}: {
  readonly picked: null | Picked;
  readonly onClose: () => void;
}) => {
  const t = useT();
  if (picked === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="font-sans text-[14px] text-muted">{t("now.pickTask")}</Text>
      </View>
    );
  }
  return (
    <TaskPaneProvider onClose={onClose}>
      <TaskScreen id={picked.id} key={picked.id} openClose={picked.close} />
    </TaskPaneProvider>
  );
};

/**
On a wide window the picked task opens next to the list, as on the old web app, and so does
the task form: while it is open the pane holds it, and closing it (or adding the task) brings
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
  const flow = useComposerFlow();
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
      <View className="flex-1 flex-row bg-bg">
        <View className="w-[560px] max-w-[50%] border-r border-line">
          <NowBoard isComposerFocused={isComposerFocused} />
        </View>
        <View className="flex-1">
          {flow.form === null ? (
            <PickedTask
              onClose={() => {
                onPick(null);
              }}
              picked={picked}
            />
          ) : (
            <ComposerPane />
          )}
        </View>
      </View>
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
