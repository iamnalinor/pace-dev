import { type Href, useNavigation, usePathname, useRouter } from "expo-router";

import { isSidebarPath } from "#app/ui/sidebar.tsx";
import { useBreakpoint } from "#app/ui/use-breakpoint.ts";

/**
Leaves a screen for the one before it, or for its `parent` where there is none to go back to: a
link opened straight on it (the web) has nothing before it, and in More's stack it sits on More's
list alone, the stack's anchor, which is not where it was opened from (QA round 25 R25-12: Save on
a pasted `/presets/new` landed on Now).
*/
export const useLeave = (parent: Href = "/"): (() => void) => {
  const router = useRouter();
  const navigation = useNavigation();
  return () => {
    const state = navigation.getState();
    const below = state?.routes[state.index - 1];
    const isOnAnchor = parent !== "/" && below?.name === "more";
    if (!isOnAnchor && router.canGoBack()) {
      router.back();
    } else {
      router.replace(parent);
    }
  };
};

/**
The way back from a screen pushed over the tabs, or undefined where there is none to offer:
beside the sidebar or the rail (a computer's or a tablet's window) a destination is top level,
with no back chevron. With nothing to go back to it goes to `parent` (Now by default).
*/
export const useBack = (parent?: Href): (() => void) | undefined => {
  const leave = useLeave(parent);
  const hasNavigation = useBreakpoint() !== "compact";
  const path = usePathname();
  return hasNavigation && isSidebarPath(path) ? undefined : leave;
};
