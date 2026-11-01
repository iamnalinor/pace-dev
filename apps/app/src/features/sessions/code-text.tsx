import { Text } from "react-native";

/** Something to paste elsewhere (a command, a token, a URL): selectable, and read out whole. */
export const CodeText = ({
  children,
  testID,
}: {
  readonly children: string;
  readonly testID?: string;
}) => (
  <Text
    accessibilityLabel={children}
    className="rounded-lg border border-line bg-raised p-3 font-sans text-[12px] leading-[18px] text-fg"
    selectable
    testID={testID}
  >
    {children}
  </Text>
);
