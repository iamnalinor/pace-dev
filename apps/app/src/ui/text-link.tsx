import type { ReactNode } from "react";

import { Linking, Text as NativeText } from "react-native";

import { TEXT_LINK_CLASS } from "./link-props.ts";

/** Opens the address in the phone's browser; one that cannot be opened is left alone. */
const openAddress = async (url: string): Promise<void> => {
  try {
    await Linking.openURL(url);
  } catch {
    // No app takes it: the text stays as it is, nothing else happens.
  }
};

/**
A web address inside a run of text (a task's description; feedback 5 item 8): nested in the kit's
`Text`, it takes the run's type and wraps with it. Its press is its own (the innermost pressable
text answers), so a tap on it never reaches the press of the text around it. A phone opens the
address in the browser; the web build swaps in `text-link.web.tsx`, an `<a target="_blank">`.
*/
export const TextLink = ({
  children,
  url,
}: {
  readonly children: ReactNode;
  readonly url: string;
}) => (
  <NativeText
    accessibilityRole="link"
    className={TEXT_LINK_CLASS}
    onPress={() => {
      void openAddress(url);
    }}
  >
    {children}
  </NativeText>
);
