import { toast } from "sonner";

type Options = {
  readonly message: string;
  readonly undoLabel: string;
  readonly onUndo: () => void;
};

/** The optimistic-action toast: what happened, and one tap to take it back. */
export const showUndoToast = ({ message, onUndo, undoLabel }: Options): void => {
  toast(message, { action: { label: undoLabel, onClick: onUndo } });
};
