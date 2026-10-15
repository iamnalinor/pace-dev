import { useEffect } from "react";

import { useLanguage } from "#app/app-state.tsx";

/** Keep the web document's screen-reader language aligned with the visible account or guest UI. */
export const DocumentLanguage = () => {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
};
