import { useRef } from "react";
import { View } from "react-native";

import { z } from "@pace/core";

import { useT } from "../app-state.tsx";
import { Pressable } from "./pressable.tsx";
import { Inspector, type ShellProps } from "./shell-regions.tsx";
import { Text } from "./text.tsx";

/** The part of the `main` element the skip link moves the keyboard to. */
type Focusable = { readonly focus?: (options?: { readonly preventScroll?: boolean }) => void };

/**
The keyboard's first stop on every page (F-A11Y-12): "Skip to content" moves focus past the
navigation into `main`. Out of sight until focused (`global.css`, `[data-skip-link]`).
*/
const SkipLink = ({ onSkip }: { readonly onSkip: () => void }) => {
  const t = useT();
  return (
    <View
      className="absolute left-2 top-2"
      style={{ zIndex: z.overlay }}
      {...({ dataSet: { skipLink: "" } } as object)}
    >
      <Pressable
        className="justify-center rounded-md bg-elevated px-4"
        onPress={onSkip}
        role="link"
      >
        <Text role="callout">{t("nav.skipToContent")}</Text>
      </Pressable>
    </View>
  );
};

/**
The web's shell (see `shell.tsx`): the same three regions; the shell that carries the navigation
also makes the content the page's `main` landmark, with the skip link before everything.
*/
export const Shell = ({ content, navigation, ...inspector }: ShellProps) => {
  const mainRef = useRef<View>(null);
  const isTopLevel = navigation !== undefined;
  return (
    <View className="flex-1 flex-row bg-app">
      {isTopLevel ? (
        <SkipLink
          onSkip={() => {
            (mainRef.current as Focusable | null)?.focus?.({ preventScroll: true });
          }}
        />
      ) : null}
      {navigation}
      <View
        className="min-w-0 flex-1"
        ref={mainRef}
        testID="shell-content"
        {...(isTopLevel && ({ role: "main", tabIndex: -1 } as object))}
      >
        {content}
      </View>
      <Inspector {...inspector} />
    </View>
  );
};
