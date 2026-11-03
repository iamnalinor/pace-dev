import { useMemo } from "react";
import { Text as NativeText } from "react-native";

import { type TextProps, textProps, titleRef } from "./text-props.ts";

export type { TextProps } from "./text-props.ts";

/**
The web's Text: a cut text says so to the overflow sweep (`e2e/worst-case.e2e.ts`) with
`data-text-policy` and keeps its full value readable in the `title` (spec §4.1.2 rule 4).
*/
export const Text = (props: TextProps) => {
  const { native, policy } = textProps(props);
  const ref = useMemo(() => titleRef(policy, props.children), [policy, props.children]);
  return (
    <NativeText
      {...native}
      // react-native-web's props React Native's types do not know: the element itself on `ref`
      // (it has `setAttribute`), `dataSet` as a `data-*` attribute.
      {...(ref !== undefined && ({ dataSet: { textPolicy: policy }, ref } as object))}
    />
  );
};
