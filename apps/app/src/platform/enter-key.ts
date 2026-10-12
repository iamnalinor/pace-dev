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
