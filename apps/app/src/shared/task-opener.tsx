import { useRouter } from "expo-router";
import { createContext, type ReactNode, use, useCallback } from "react";

export type OpenTask = (taskId: string, options?: { readonly close?: boolean }) => void;

/** A list that has a detail pane next to it opens tasks there instead of a new screen. */
const OpenerContext = createContext<null | OpenTask>(null);

/** The task open in the pane, so its row shows which one it is. */
const SelectedContext = createContext<null | string>(null);

/** Inside a detail pane: how the task's back button closes it. */
const PaneContext = createContext<(() => void) | null>(null);

export const TaskOpenerProvider = ({
  children,
  open,
  selectedId,
}: {
  readonly children: ReactNode;
  readonly open: OpenTask;
  readonly selectedId: null | string;
}) => (
  <OpenerContext value={open}>
    <SelectedContext value={selectedId}>{children}</SelectedContext>
  </OpenerContext>
);

/** The id of the task open beside the list, if any. */
export const useSelectedTask = (): null | string => use(SelectedContext);

export const TaskPaneProvider = ({
  children,
  onClose,
}: {
  readonly children: ReactNode;
  readonly onClose: () => void;
}) => <PaneContext value={onClose}>{children}</PaneContext>;

/** Opens a task: in the pane next to the list when there is one, else on its own screen. */
export const useOpenTask = (): OpenTask => {
  const router = useRouter();
  const pane = use(OpenerContext);
  const push = useCallback<OpenTask>(
    (taskId, options) => {
      router.push(`/task/${taskId}${options?.close === true ? "?close=1" : ""}`);
    },
    [router],
  );
  return pane ?? push;
};

/** The task screen's back action: close the pane it sits in, or go back a screen. */
export const useTaskBack = (): (() => void) => {
  const router = useRouter();
  const closePane = use(PaneContext);
  return closePane ?? router.back;
};
