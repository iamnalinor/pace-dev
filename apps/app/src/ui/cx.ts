/** Joins class names, skipping falsy parts (the app has no `clsx`). */
export const cx = (...parts: readonly (false | null | string | undefined)[]): string =>
  parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
