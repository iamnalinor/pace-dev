import { usePathname } from "expo-router";
import { useEffect } from "react";

import { useT } from "#app/app-state.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

import { documentTitle } from "./route-title.ts";

/**
The tab's title names the screen ("Settings · Pace", QA round 11 L11), and the page's
`color-scheme` follows the app's theme, not only the system's: a dark theme chosen in Settings
gets dark scrollbars and native controls too (QA round 15 L8).
*/
export const DocumentHead = () => {
  const t = useT();
  const path = usePathname();
  const { palette, scheme } = useTheme();
  const title = documentTitle(path, (key) => t(key));
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;
    // The page behind the app and the browser's own bar follow the app's theme, not only the
    // system's (QA round 17 L9); theme-boot.js does the same before the app loads.
    document.documentElement.dataset["theme"] = scheme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.removeAttribute("media");
      meta.setAttribute("content", palette.bg);
    }
  }, [palette.bg, scheme]);
  return null;
};
