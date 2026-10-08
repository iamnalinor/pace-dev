import { formatDuration, type Language } from "@pace/core";

/** `100` → `1h 40m`; `~1h 40m` when the figure is an estimate. */
export const formatMinutes = (
  minutes: number,
  language: Language,
  { approx = false }: { readonly approx?: boolean } = {},
): string => `${approx ? "~" : ""}${formatDuration(minutes, language)}`;
