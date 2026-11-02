import { usePathname } from "expo-router";
import { useEffect } from "react";

import { useT } from "#app/app-state.tsx";

import { documentTitle } from "./route-title.ts";

/**
The tab's title names the screen ("Settings · Pace", QA round 11 L11). The page's own scheme
(`color-scheme`, ground, `theme-color`; QA round 15 L8) is `DocumentTheme`'s: one writer.
*/
export const DocumentHead = () => {
  const t = useT();
  const path = usePathname();
  const title = documentTitle(path, (key) => t(key));
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
};
