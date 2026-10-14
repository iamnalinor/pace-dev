import { useState } from "react";
import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { ComposerProvider, useComposerFlow } from "#app/features/now/composer/composer-flow.tsx";
import { ComposerPane } from "#app/features/now/composer/composer-pane.tsx";
import { NowBoard } from "#app/features/now/now-screen.tsx";
import { TaskScreen } from "#app/features/task/task-screen.tsx";
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
the picked task back. Picking a task while the form is open folds the draft back into the line.
*/
const NowSplit = ({ isComposerFocused }: { readonly isComposerFocused: boolean }) => {
  const flow = useComposerFlow();
  const [picked, setPicked] = useState<null | Picked>(null);
  // The check's submit sheet opens once: the form taking the pane over has used it up, so
  // the task coming back after the form does not open the sheet again by itself.
  if (flow.form !== null && picked?.close === true) {
    setPicked({ ...picked, close: false });
  }
  return (
    <TaskOpenerProvider
      open={(id, options) => {
        flow.hide();
        setPicked({ close: options?.close === true, id });
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
                setPicked(null);
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

/**
Now on a phone; on a wide window the list with the picked task (or the task form) beside it.
`composeText` is a share (or New task, when empty) arriving on /add.
*/
export const NowScreen = ({ composeText }: { readonly composeText?: string | undefined }) => {
  const isWide = useIsWide();
  const isComposerFocused = composeText !== undefined;
  return (
    <ComposerProvider
      initialText={composeText}
      isFormInPane={isWide}
      key={composeText ?? ""}
      opensForm={composeText === ""}
    >
      {isWide ? (
        <NowSplit isComposerFocused={isComposerFocused} />
      ) : (
        <NowBoard isComposerFocused={isComposerFocused} />
      )}
    </ComposerProvider>
  );
};
