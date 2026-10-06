import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (`p-2` + `p-4` → `p-4`). */
export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs));
