import { useEffect } from "react";

import { deviceLanguage } from "./device-language.ts";

/** The router's error boundary replaces the normal document language effect. */
export const CrashDocumentLanguage = () => {
  useEffect(() => {
    document.documentElement.lang = deviceLanguage();
  }, []);
  return null;
};
