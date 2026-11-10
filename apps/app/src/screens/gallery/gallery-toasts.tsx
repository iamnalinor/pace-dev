import { View } from "react-native";

import type { Action } from "@pace/core";
import type { GalleryData } from "@pace/core/testing";

import { usePace, useT } from "#app/app-state.tsx";
import { TOAST_FIT, ToastCard, toastQuote } from "#app/ui/toast.tsx";
import { approvalText } from "@pace/client";

import { GALLERY_NOW } from "./gallery-models.ts";

const NOTHING = (): void => undefined;

/** The most actions one assistant answer proposes: the approval toast's worst case. */
const APPROVED_ACTIONS = 10;
/** A task id for an action the gallery only words (nothing is applied). */
const GALLERY_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

/**
The toast at its narrowest (a narrow column) and at its widest (`toast.max`): the refusal
sentence of a rolled-back tap whole (QA round 22 R22-01), a done task quoted short with Undo, and
an approval of ten actions (two named, the rest counted).
The overflow sweep reads every line of it.
*/
export const Toasts = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const { state } = usePace();
  const [task, other] = data.tasks;
  // An approval of up to ten actions, the widest sentence first: a rename quotes two names (the
  // first task's title renamed to the second's), then each task started by its title.
  const renamed: readonly Action[] =
    task === undefined || other === undefined
      ? []
      : [
          {
            kind: "task.update",
            patch: { title: other.title },
            summary: `“${task.title}”`,
            taskId: GALLERY_TASK_ID,
          },
        ];
  const approved: readonly Action[] = [
    ...renamed,
    ...data.tasks.slice(0, APPROVED_ACTIONS - renamed.length).map(
      (each): Action => ({
        category: "study",
        kind: "activity.start",
        label: each.title,
        summary: each.title,
      }),
    ),
  ];
  const world = { language: data.language, now: GALLERY_NOW, state: state.store.getState() };
  const undo = { label: t("common.undo"), onPress: NOTHING };
  const toasts = [
    { message: t("actionError.persist_failed") },
    ...(task === undefined
      ? []
      : [
          { action: undo, message: t("now.doneToast", { title: toastQuote(task.title) }) },
          { action: undo, message: approvalText(approved, world, TOAST_FIT) },
        ]),
  ];
  return (
    <View className="gap-3" testID="gallery-toasts">
      {["w-sidebar-inner", "w-full max-w-toast-max"].map((width) => (
        <View className="gap-3" key={width}>
          {toasts.map((toast) => (
            <ToastCard className={width} key={toast.message} onDone={NOTHING} toast={toast} />
          ))}
        </View>
      ))}
    </View>
  );
};
