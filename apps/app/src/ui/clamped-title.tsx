import { useEffect, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";

import type { TextTone } from "./text-props.ts";

import { Text } from "./text.tsx";

/** How much taller the whole text must be than the clamped box to count as cut (rounding). */
const SLACK = 1;

/** Laid out, never seen: the measuring copy. */
const UNSEEN = { opacity: 0 } as const;

const heightOf = (event: LayoutChangeEvent): number => event.nativeEvent.layout.height;

/**
A content title clamped at `lines`, which tells `onClamped` whether the clamp cut it: the whole
text is laid out out of sight at the same width (no line limit, hidden from readers and the
pointer) and the two heights compared, the same way on a phone and on the web (React Native Web
has no `onTextLayout`). Reported again whenever the width or the text changes it.
*/
export const ClampedTitle = ({
  className,
  lines,
  onClamped,
  title,
  tone,
}: {
  readonly title: string;
  readonly lines: number;
  readonly onClamped: (isClamped: boolean) => void;
  readonly className?: string | undefined;
  readonly tone?: TextTone | undefined;
}) => {
  const [clamped, setClamped] = useState<null | number>(null);
  const [whole, setWhole] = useState<null | number>(null);
  useEffect(() => {
    if (clamped !== null && whole !== null) {
      onClamped(whole > clamped + SLACK);
    }
  }, [clamped, onClamped, whole]);
  return (
    <View>
      <Text
        lines={lines}
        onLayout={(event) => {
          setClamped(heightOf(event));
        }}
        policy="clamp"
        role="body"
        testID="clamped-title"
        {...(className !== undefined && { className })}
        {...(tone !== undefined && { tone })}
      >
        {title}
      </Text>
      <View
        aria-hidden
        className="absolute inset-x-0 top-0"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={UNSEEN}
      >
        <Text
          onLayout={(event) => {
            setWhole(heightOf(event));
          }}
          role="body"
          selectable={false}
          testID="clamped-title-whole"
          {...(className !== undefined && { className })}
        >
          {title}
        </Text>
      </View>
    </View>
  );
};
