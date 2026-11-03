import { Text as NativeText } from "react-native";

import { type TextProps, textProps } from "./text-props.ts";

export type { TextProps } from "./text-props.ts";

/**
Every text the app draws (spec §3.2, §4.1.1): a type role, a tone and a policy for what does not
fit. The only place a line limit is set (lint: `numberOfLines` outside the kit, bug-lessons 109).
The web build swaps in `text.web.tsx`, which marks a cut text for the overflow sweep.
*/
export const Text = (props: TextProps) => <NativeText {...textProps(props).native} />;
