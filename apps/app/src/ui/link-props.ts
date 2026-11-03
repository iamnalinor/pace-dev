import type { Href } from "expo-router";

import type { PressableProps } from "./pressable-props.ts";

/**
The kit's Link (spec §4.1.1, §7): a Pressable that goes to `href`. Its role is `link` and its
press is the navigation, so neither is the caller's.
*/
export type LinkProps = Omit<PressableProps, "onLongPress" | "onPress" | "role"> & {
  readonly href: Href;
};

/**
What expo-router's `Link asChild` hands its child, beside the caller's props: the address, its
press (`onClick` on the web, `onPress` elsewhere) and the anchor's attributes.
*/
export type AnchorProps = Omit<PressableProps, "role"> & {
  readonly download?: string | undefined;
  readonly href?: string | undefined;
  readonly onClick?: PressableProps["onPress"];
  readonly rel?: string | undefined;
  readonly target?: string | undefined;
};

/** An address outside the app (spec §7): a new tab on the web, the browser on a phone. */
export const EXTERNAL = { rel: "noopener", target: "_blank" } as const;

export const isExternal = (href: Href): boolean =>
  typeof href === "string" && /^https?:\/\//u.test(href);
