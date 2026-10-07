import type { Language } from "@pace/core";

/** `Tue · Oct 6` / `вт · 6 окт.` — the mono eyebrow above every page title. */
export const formatEyebrow = (date: Date, language: Language, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "short",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const rest = parts
    .filter((part) => part.type !== "weekday")
    .map((part) => part.value)
    .join("")
    .replace(/^[\s,]+/, "")
    .trim();
  return `${weekday} · ${rest}`;
};
