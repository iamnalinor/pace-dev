import { useMemo } from "react";

import type { Viewer } from "#app/format/time.ts";

import { useLanguage, usePace } from "#app/app-state.tsx";

/** The account language with the clock's instant and the device zone (ticks every 30 s). */
export const useViewer = (): Viewer => {
  const { deviceTz, now } = usePace().hooks.useClock();
  const language = useLanguage();
  return useMemo(() => ({ deviceTz, language, now }), [deviceTz, language, now]);
};
