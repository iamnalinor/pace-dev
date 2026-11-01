import type { View } from "react-native";

import { useRef } from "react";

import { moveFocus } from "../platform/move-focus.ts";

/** Where focus goes once that control is mounted: the confirm's Cancel, or an opener by key. */
const CANCEL = "\0cancel";

/**
Keeps focus through an inline confirm (bug class 5). Opening it unmounts the button that held
focus and Cancel unmounts itself, so focus would fall back to the page and the question would go
unsaid. Call `toCancel()` when opening and `toOpener(key)` when cancelling; give the confirm's
Cancel `cancelRef(question)` and each opener `openerRef(key)`. The move happens as the control
mounts, in a ref callback, so no effect waits for a render.
*/
export const useConfirmFocus = () => {
  const nextRef = useRef<null | string>(null);
  const take = (key: string, node: null | View, say?: string): void => {
    if (node === null || nextRef.current !== key) {
      return;
    }

    nextRef.current = null;
    moveFocus(node, say);
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
    toCancel: () => {
      nextRef.current = CANCEL;
    },
    toOpener: (key = "opener") => {
      nextRef.current = key;
    },
  };
};
