import { usePathname, useRouter } from "expo-router";

import { useIsWide } from "#app/ui/layout.ts";
import { isSidebarPath } from "#app/ui/sidebar.tsx";

/**
The way back from a screen pushed over the tabs, or undefined where there is none to offer:
beside the sidebar (a wide window) a sidebar destination is top level, with no back chevron.
*/
export const useBack = (): (() => void) | undefined => {
  const router = useRouter();
  const isWide = useIsWide();
  const path = usePathname();
  if (isWide && isSidebarPath(path)) {
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
