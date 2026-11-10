import { createContext, type ReactNode, use, useEffect, useState } from "react";

/** A form's primary action as the sheet holds it: pressed by Enter in a single-line field. */
type Primary = { readonly isEnabled: boolean; readonly press: () => void };

/** The sheet's slot for its form's primary action: who registered last, and pressing it. */
type Slot = {
  /** Registers `primary`; the returned function takes it back (only if it is still the one). */
  readonly register: (primary: Primary) => () => void;
  /** Presses the registered action when it is enabled. */
  readonly submit: () => void;
};

const SubmitContext = createContext<null | Slot>(null);

const createSlot = (): Slot => {
  let current: null | Primary = null;
  return {
    register: (primary) => {
      current = primary;
      return () => {
        if (current === primary) {
          current = null;
        }
      };
    },
    submit: () => {
      if (current?.isEnabled === true) {
        current.press();
      }
    },
  };
};

/** Gives an overlay the slot its form's primary action registers in. */
export const SheetSubmitScope = ({ children }: { readonly children: ReactNode }) => {
  const [slot] = useState(createSlot);
  return <SubmitContext value={slot}>{children}</SubmitContext>;
};

/**
Registers a form's primary action with the sheet around it (`SheetActions` does, for a form; a
confirmation never registers: Delete is never one keystroke away). The newest registration holds.
*/
export const useRegisterSheetPrimary = (primary: null | Primary): void => {
  const slot = use(SubmitContext);
  useEffect(() => {
    if (slot === null || primary === null) {
      return;
    }
    return slot.register(primary);
  }, [primary, slot]);
};

/**
What Enter in a single-line field of a sheet does (QA round 21 M1): it presses the form's primary
action when there is one and it is enabled. The field keeps the focus either way (it does not blur
on submit), so focus never drops to the page behind the dim. Undefined outside a sheet: the field's
own `onSubmitEditing` stays as it was.
*/
export const useSheetSubmit = (): (() => void) | undefined => use(SubmitContext)?.submit;
