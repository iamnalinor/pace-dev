import { Link as RouterLink } from "expo-router";

import { type AnchorProps, EXTERNAL, isExternal, type LinkProps } from "./link-props.ts";
// The web Pressable by its own name: the web build would swap it in anyway, but jest does not, and
// link.web.test must see the web Pressable this file renders in the browser.
import { Pressable } from "./pressable.web.tsx";

export type { LinkProps } from "./link-props.ts";

/**
The anchor: react-native-web renders an element with `href` as `<a href>`, with `rel` and
`target` from `hrefAttrs`. expo-router's press arrives as `onClick`, which react-native-web's
Pressable would drop for its own, so it becomes the Pressable's `onPress`: it reads the event, lets
a Ctrl/⌘-, Shift- or middle-click open a new tab, and navigates in place on a plain click. A
disabled link has no `href`: react-native-web refuses its press, but the browser would still
follow the address.
*/
/** Disabled by either word for it (a hyphenated `aria-disabled` passes any JSX type). */
const isDisabledAnchor = (props: object): boolean =>
  (props as { readonly disabled?: boolean }).disabled === true ||
  (props as { readonly "aria-disabled"?: boolean })["aria-disabled"] === true;

const Anchor = ({
  download: _download,
  href,
  onClick,
  onPress,
  rel,
  target,
  ...rest
}: AnchorProps) => (
  <Pressable
    {...rest}
    // react-native-web's props React Native's types do not know.
    {...(!isDisabledAnchor(rest) && ({ href, hrefAttrs: { rel, target } } as object))}
    onPress={onClick ?? onPress}
    role="link"
  />
);

/** Navigation to an address on the web: a real `<a href>` (spec §7, F-WEB-03). */
export const Link = ({ href, ...rest }: LinkProps) => (
  <RouterLink asChild href={href}>
    <Anchor {...rest} {...(isExternal(href) && EXTERNAL)} />
  </RouterLink>
);
