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

/**
Takes back exactly the events an action appended. Safer than "undo the last thing this
device did": a sync or the instance generator may have appended something in between.
*/
export const revokeEvents = async (
  revoke: (eventId: string) => Promise<unknown>,
  events: readonly { readonly id: string }[],
): Promise<void> => {
  await Promise.all(events.map(async (event) => await revoke(event.id)));
};
