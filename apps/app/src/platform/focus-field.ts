import type { TextInput } from "react-native";

/** Puts the cursor in the field (a phone has no scroll to guard against). */
export const focusField = (input: null | TextInput): void => {
  input?.focus();
};
