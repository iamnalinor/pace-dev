import type { WeekBlock } from "@pace/client";
import type { CalendarEvent } from "@pace/core";

/** One thing a tap opens: a tracked block, or a calendar event. */
export type Single =
  | { readonly kind: "block"; readonly block: WeekBlock }
  | { readonly kind: "event"; readonly event: CalendarEvent };

/** What a tap on the grid opens: a tracked block, a calendar event, or a folded run of them. */
export type Picked = Single | { readonly kind: "group"; readonly items: readonly Single[] };

/** Which block or event a pick is, so the grid can mark it. */
export const pickedKey = (picked: Picked): string => {
  switch (picked.kind) {
    case "event": {
      return `e-${picked.event.id}-${picked.event.startAt}`;
    }
    case "block": {
      return `b-${picked.block.id}`;
    }
    case "group": {
      const [first] = picked.items;
      return `g-${first === undefined ? "" : pickedKey(first)}-${String(picked.items.length)}`;
    }
  }
};
