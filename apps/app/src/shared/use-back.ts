import { usePathname, useRouter } from "expo-router";

import { isSidebarPath } from "#app/ui/sidebar.tsx";
import { useBreakpoint } from "#app/ui/use-breakpoint.ts";

/**
The way back from a screen pushed over the tabs, or undefined where there is none to offer:
beside the sidebar or the rail (a computer's or a tablet's window) a destination is top level,
with no back chevron.
*/
export const useBack = (): (() => void) | undefined => {
  const router = useRouter();
  const hasNavigation = useBreakpoint() !== "compact";
  const path = usePathname();
  if (hasNavigation && isSidebarPath(path)) {
    return undefined;
  }
  return () => {
    // A link opened straight on this screen (the web) has nothing to go back to.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };
};
