import type { ReactNode } from "react";

import { type GestureResponderEvent, Text as NativeText } from "react-native";

import { EXTERNAL, TEXT_LINK_CLASS } from "./link-props.ts";

/** A long address breaks inside itself rather than run out of its column (bug-lessons 121). */
const BREAK_ANYWHERE = { wordBreak: "break-word" } as const;

/**
The web's address inside text: react-native-web renders a Text with `href` as an `<a>`, so the
browser opens it in a new tab (`rel="noopener"`) and Ctrl/⌘- or middle-click work as anywhere.
Its click stops there: the text around it, which starts editing on a click, never hears it. A
long address breaks anywhere rather than run out of its column.
*/
export const TextLink = ({
  children,
  url,
}: {
  readonly children: ReactNode;
  readonly url: string;
}) => (
  <NativeText
    className={TEXT_LINK_CLASS}
    // react-native-web's props and styles React Native's types do not know.
    {...({ href: url, hrefAttrs: EXTERNAL, style: BREAK_ANYWHERE } as object)}
    onPress={(event: GestureResponderEvent) => {
      event.stopPropagation();
    }}
    role="link"
  >
    {children}
  </NativeText>
);
