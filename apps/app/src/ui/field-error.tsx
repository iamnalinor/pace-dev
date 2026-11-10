import { Text, View } from "react-native";

import { Icon } from "./icon.tsx";
import { useRevealOnShow } from "./overlay-reveal.ts";

/** The error under the field, with its glyph, announced once (polite). */
export const ErrorMessage = ({ error, id }: { readonly error: string; readonly id: string }) => {
  const ref = useRevealOnShow(error);
  return (
    <View
      className="flex-row items-start gap-1"
      nativeID={id}
      ref={ref}
      testID="text-field-message"
    >
      <Icon name="triangle-alert" size="inline" tone="danger" />
      <Text
        accessibilityLiveRegion="polite"
        className="shrink font-sans text-footnote text-danger"
        role="alert"
      >
        {error}
      </Text>
    </View>
  );
};
