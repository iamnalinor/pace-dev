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
    className="rounded-lg border border-separator bg-fill-3 p-3 font-sans text-caption font-normal text-label-primary"
    selectable
    testID={testID}
  >
    {children}
  </Text>
);
