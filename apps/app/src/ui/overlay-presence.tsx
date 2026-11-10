import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

/**
What an `OverlayPresence` tells the overlay inside it: whether it is still wanted, and how to say
that its exit has finished.
*/
type Exit = { readonly isOpen: boolean; readonly onExited: () => void };

const ExitContext = createContext<Exit | null>(null);

/**
Keeps an overlay mounted through its exit when its owner mounts it only while there is something
to show (`{picked === null ? null : <PickedSheet … />}`): it renders `children` with the last value
it was given, tells the overlay it is closing when the value goes, and lets go of it once the
overlay's exit animation has finished (F-MOT-05: the sheet used to vanish in one frame). A value
given again during the exit opens it again.
*/
export const OverlayPresence = <T,>({
  children,
  value,
}: {
  readonly children: (kept: T) => ReactNode;
  readonly value: null | T | undefined;
}) => {
  const [kept, setKept] = useState<null | T | undefined>(value);
  if (value !== null && value !== undefined && value !== kept) {
    setKept(value);
  }
  const isOpen = value !== null && value !== undefined;
  const onExited = useCallback(() => {
    setKept(null);
  }, []);
  const exit = useMemo(() => ({ isOpen, onExited }), [isOpen, onExited]);
  return kept === null || kept === undefined ? null : (
    <ExitContext value={exit}>{children(kept)}</ExitContext>
  );
};

/**
An overlay's phase: `isOpen` (wanted: its own `open` and, inside an `OverlayPresence`, that one's),
`isMounted` (shown, or on its way out) and `letGo`, which the exit animation calls when it has
finished. Opened again during the exit, it is simply open (the exit's completion reports it was
cancelled and lets nothing go).
*/
export const useOverlayPhase = (isAsked: boolean) => {
  const exit = use(ExitContext);
  const isOpen = isAsked && (exit?.isOpen ?? true);
  const [isMounted, setIsMounted] = useState(isOpen);
  if (isOpen && !isMounted) {
    setIsMounted(true);
  }
  const letGo = useCallback(() => {
    setIsMounted(false);
    exit?.onExited();
  }, [exit]);
  return { isMounted, isOpen, letGo };
};
