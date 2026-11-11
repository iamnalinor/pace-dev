import { useEffect } from "react";

import { useAccountLanguage, useAuth, useLanguage } from "#app/app-state.tsx";

import { storeLanguage } from "./language-stored.ts";

/**
Keeps the web document's screen-reader language aligned with the visible account or guest UI, and
keeps the signed-in account's language for the next load's first paint (`theme-boot.js` sets
`lang` from it before the bundle; the app's first frame reads it too). Signed out, it is forgotten.
*/
export const DocumentLanguage = () => {
  const language = useLanguage();
  const accountLanguage = useAccountLanguage();
  const { status } = useAuth();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (accountLanguage !== null) {
      storeLanguage(accountLanguage);
    } else if (status === "signed-out") {
      storeLanguage(null);
    }
  }, [accountLanguage, status]);
  return null;
};
