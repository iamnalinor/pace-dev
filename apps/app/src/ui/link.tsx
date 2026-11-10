import { Link as RouterLink } from "expo-router";

import type { AnchorProps, LinkProps } from "./link-props.ts";

import { Pressable } from "./pressable.tsx";

export type { LinkProps } from "./link-props.ts";

/**
The press expo-router hands over goes to the kit's Pressable; a phone has no anchor (an address
outside the app opens in the browser through expo-router).
*/
const Anchor = ({
  download: _download,
  href: _href,
  onClick: _onClick,
  rel: _rel,
  target: _target,
  ...rest
}: AnchorProps) => <Pressable {...rest} role="link" />;

/**
Navigation to an address (spec §4.1.1, F-WEB-03): expo-router's `Link asChild` over the kit's
Pressable, so a link has the state layer of every control. The web build swaps in `link.web.tsx`,
which renders an `<a href>`.
*/
export const Link = ({ href, ...rest }: LinkProps) => (
  <RouterLink asChild href={href}>
    <Anchor {...rest} />
  </RouterLink>
);
