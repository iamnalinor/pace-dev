import type { View } from "react-native";

import { useRef } from "react";

import { isFocusLost, moveFocus } from "../platform/move-focus.ts";

/** Where focus goes once that control is mounted: the confirm's Cancel, or an opener by key. */
const CANCEL = "\0cancel";
const STATUS = "\0status";

/**
Keeps focus through an inline confirm (bug class 5). Opening it unmounts the button that held
focus and Cancel unmounts itself, so focus would fall back to the page and the question would go
unsaid. Call `toCancel()` when opening and `toOpener(key)` when cancelling; give the confirm's
Cancel `cancelRef(question)` and each opener `openerRef(key)`. The move happens as the control
mounts, in a ref callback, so no effect waits for a render.

The same holds when a control swaps for its status (an answered notice): call `toStatus()` when the
press is sent and give the status `ref={statusRef()}`. It takes focus only if focus is still nowhere
when it mounts; one the person moved meanwhile stays; `release()` drops the claim when the press
failed (the control stays).
*/
export const useConfirmFocus = () => {
  const nextRef = useRef<null | string>(null);
  const take = (key: string, node: null | View, say?: string): void => {
    if (node === null || nextRef.current !== key) {
      return;
    }

    nextRef.current = null;
    // A status only takes what the swapped control left behind, never what the person moved.
    if (key !== STATUS || isFocusLost()) {
      moveFocus(node, say);
    }
  };
  const takeStatus = (node: null | View): void => {
    take(STATUS, node);
  };
  return {
    cancelRef: (question: string) => (node: null | View) => {
      take(CANCEL, node, question);
    },
    openerRef:
      (key = "opener") =>
      (node: null | View) => {
        take(key, node);
      },
    release: () => {
      nextRef.current = null;
    },
    statusRef: () => takeStatus,
    toCancel: () => {
      nextRef.current = CANCEL;
    },
    toStatus: () => {
      nextRef.current = STATUS;
    },
    toOpener: (key = "opener") => {
      nextRef.current = key;
    },
  };
};
