import type { TextInputProps } from "react-native";

type EnterHandlers = {
  readonly onEnter: () => void;
  readonly onKeyPress: NonNullable<TextInputProps["onKeyPress"]>;
};

/**
How the composer's line takes Enter on a computer: by key, so Shift+Enter still breaks the line
and Alt+Enter goes to the Inbox. The line owns its keys: the page's shortcuts leave it alone.
*/
export const lineEnterProps = ({ onKeyPress }: EnterHandlers): TextInputProps =>
  ({ dataSet: { paceKeys: "own" }, onKeyPress }) as TextInputProps;
