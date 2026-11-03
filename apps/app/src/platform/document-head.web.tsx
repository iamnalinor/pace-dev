import { usePathname } from "expo-router";
import { useEffect } from "react";

import { useAppState, useLanguage, useT } from "#app/app-state.tsx";

import { documentTitle, routeSubject, subjectName } from "./route-title.ts";

/**
The tab's title names the screen ("Settings · Pace", QA round 11 L11), a detail screen by the thing
it shows ("Algebra HW 6 · Pace", QA round 18 L8). The page's own scheme (`color-scheme`, ground,
`theme-color`; QA round 15 L8, QA round 17 L9) is `DocumentTheme`'s: one writer.
*/
export const DocumentHead = () => {
  const t = useT();
  const language = useLanguage();
  const path = usePathname();
  const subject = routeSubject(path);
  const name = useAppState((state) =>
    subject === null ? null : subjectName(state, subject, language),
  );
  const title = documentTitle(
    path,
    (key) => t(key),
    () => name,
  );
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
};
