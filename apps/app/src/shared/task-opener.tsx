import { useRouter } from "expo-router";
import { createContext, type ReactNode, use, useCallback } from "react";

export type OpenTask = (taskId: string) => void;

/** A list that has a detail pane next to it opens tasks there instead of a new screen. */
const OpenerContext = createContext<null | OpenTask>(null);

/** The task open in the pane, so its row shows which one it is. */
const SelectedContext = createContext<null | string>(null);

/** Inside a detail pane: how the task's back button closes it. */
const PaneContext = createContext<(() => void) | null>(null);

/** Inside a detail pane: how it goes once its task is gone (deleted), without a history step. */
const GoneContext = createContext<(() => void) | null>(null);

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
  onGone,
}: {
  readonly children: ReactNode;
  readonly onClose: () => void;
  /** The task was deleted: the pane goes and Back does not stop on it (review of round 24, I2). */
  readonly onGone: () => void;
}) => (
  <PaneContext value={onClose}>
    <GoneContext value={onGone}>{children}</GoneContext>
  </PaneContext>
);

/** Opens a task: in the pane next to the list when there is one, else on its own screen. */
export const useOpenTask = (): OpenTask => {
  const router = useRouter();
  const pane = use(OpenerContext);
  const push = useCallback<OpenTask>(
    (taskId) => {
      router.push(`/task/${taskId}`);
    },
    [router],
  );
  return pane ?? push;
};

/**
The task screen's back action: close the pane it sits in, or go back a screen; with nothing to go
back to (a link opened straight on it, or Now's `?task=` handed over at a phone's width, which
replaces the entry) it goes to Now.
*/
export const useTaskBack = (): (() => void) => {
  const router = useRouter();
  const closePane = use(PaneContext);
  return (
    closePane ??
    (() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    })
  );
};

/** Whether the task sits in the pane beside the list (its "back" closes the pane). */
export const useIsInPane = (): boolean => use(PaneContext) !== null;

/**
How the task screen leaves once its task is gone (deleted): the pane goes without a history step,
so Back does not stop on an entry whose task is gone; on its own screen, as its back action.
*/
export const useTaskGoneBack = (): (() => void) => {
  const back = useTaskBack();
  return use(GoneContext) ?? back;
};
