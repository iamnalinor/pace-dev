import { Text } from "react-native";

import { cx } from "./cx.ts";

/** The label element: laid out as a block of its own, its text drawn by the kit's type role. */
const LABEL_STYLE = { display: "flex" } as const;

/**
A field's visible label on the web: a `<label for>` the field's id (spec §4.2.28, F-A11Y-15), so a
click on it focuses the field and the browser names the field by it. Its text is drawn with the
same type role as the phone's (`footnote`, `label.secondary`).
*/
export const FieldLabel = ({
  fieldId,
  isDisabled,
  text,
}: {
  readonly fieldId: string;
  readonly isDisabled: boolean;
  readonly text: string;
}) => (
  <label htmlFor={fieldId} style={LABEL_STYLE}>
    <Text
      className={cx(
        "font-sans text-footnote",
        isDisabled ? "text-label-quaternary" : "text-label-secondary",
      )}
    >
      {text}
    </Text>
  </label>
);
