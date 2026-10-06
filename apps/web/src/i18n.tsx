import { useCallback } from "react";

import { type MessageKey, type MessageParams, t } from "@pace/core";

import { useLanguage } from "./app-state.tsx";

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** `t` bound to the account language from settings; re-renders when the language changes. */
export const useT = (): Translate => {
  const language = useLanguage();
  return useCallback<Translate>((key, params) => t(language, key, params), [language]);
};
