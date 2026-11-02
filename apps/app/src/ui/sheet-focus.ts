import type { RefCallback } from "react";
import type { View } from "react-native";

/**
Where the keyboard starts in an open sheet: the callback ref for its surface. A phone has no
keyboard focus to place: its fields take focus themselves (`autoFocus`) where they mean to.
*/
const noFocus: RefCallback<View> = () => undefined;

// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web's, which does call hooks
export const useSheetFocusRef = (_options: { readonly closeLabel: string }): RefCallback<View> =>
  noFocus;
