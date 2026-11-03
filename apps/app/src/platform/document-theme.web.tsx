import { useEffect } from "react";

import { documentGround } from "@pace/core";

import type { DocumentThemeProps } from "./document-theme.tsx";

/** Both `theme-color` metas (one per `prefers-color-scheme`), one is added where the page has none. */
const themeColorMetas = (): readonly Pick<HTMLMetaElement, "setAttribute">[] => {
  const found = [...document.querySelectorAll('meta[name="theme-color"]')];
  if (found.length > 0) {
    return found;
  }
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.append(meta);
  return [meta];
};

/**
The page follows the app's theme, not the OS's (F-WEB-02): `data-theme` on <html> (the ground
and `color-scheme` of index.html's stylesheet hang on it) and both `theme-color` metas, which
take the dimmed ground while a sheet's scrim is up. `public/theme-boot.js` sets the same before
the bundle loads; this keeps it in step with the in-app toggle and the OS. The tab's title is
`DocumentHead`'s.
*/
export const DocumentTheme = ({ isDimmed, scheme }: DocumentThemeProps) => {
  useEffect(() => {
    document.documentElement.dataset["theme"] = scheme;
  }, [scheme]);
  useEffect(() => {
    const ground = documentGround(scheme, isDimmed);
    for (const meta of themeColorMetas()) {
      meta.setAttribute("content", ground);
    }
  }, [isDimmed, scheme]);
  return null;
};
