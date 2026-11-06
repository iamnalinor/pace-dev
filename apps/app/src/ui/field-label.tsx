import { Text } from "react-native";

import { cx } from "./cx.ts";

/**
A field's visible label (`footnote`, `label.secondary`; spec §4.2.28). On a phone the field is
named by it through its accessibility label; the web build swaps in `field-label.web.tsx`, a real
`<label for>` (clicking it focuses the field, F-A11Y-15).
*/
export const FieldLabel = ({
  fieldId: _fieldId,
  isDisabled,
  text,
}: {
  /** The field's id, which the web's `<label for>` points at. */
  readonly fieldId: string;
  readonly isDisabled: boolean;
  readonly text: string;
}) => (
  <Text
    className={cx(
      "font-sans text-footnote",
      isDisabled ? "text-label-quaternary" : "text-label-secondary",
    )}
  >
    {text}
  </Text>
);
