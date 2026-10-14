import type { TextInputProps } from "react-native";

type EnterHandlers = {
  readonly onEnter: () => void;
  readonly onKeyPress: NonNullable<TextInputProps["onKeyPress"]>;
};

/**
How the composer's line takes Enter on a phone: the keyboard's Enter submits (a soft keyboard's
key press cannot be cancelled, so it would also insert a line break and start over).
*/
export const lineEnterProps = ({ onEnter }: EnterHandlers): TextInputProps => ({
  onSubmitEditing: onEnter,
  submitBehavior: "submit",
});

/**
A field that takes one entry after another (a subtask, then the next): Enter submits and the
keyboard stays up. A phone's keyboard has no Escape to claim.
*/
export const entryFieldProps: TextInputProps = { submitBehavior: "submit" };
