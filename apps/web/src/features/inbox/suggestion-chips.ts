import type { Suggestion } from "@pace/core";

/** The fields of a suggestion the person can change before accepting, in chip order. */
export const CHIP_FIELDS = ["project", "preset", "due", "importance"] as const;

export type ChipField = (typeof CHIP_FIELDS)[number];

/** What the person changed on a card; accepted on top of the suggestion. */
export type SuggestionEdits = Partial<Suggestion>;

/** The suggestion as it will be accepted: the guess with the person's edits on top. */
export const editedSuggestion = (
  suggestion: Suggestion,
  edits: SuggestionEdits = {},
): Suggestion => ({
  ...suggestion,
  ...edits,
});
