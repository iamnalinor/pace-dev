import { Text } from "react-native";

import { useRevealOnShow } from "#app/ui/overlay-reveal.ts";

/**
Why the form cannot be saved, under the field it is about. Announced as it appears (an alert on
the web, a polite live region on Android), so a screen reader hears what a faded Save means.
*/
export const FormAlert = ({ children }: { readonly children: string }) => {
  // In a sheet, scrolled into view above the pinned Save (QA round 26 R26-01).
  const ref = useRevealOnShow<Text>(children);
  return (
    <Text
      accessibilityLiveRegion="polite"
      className="font-sans text-caption font-normal text-danger"
      ref={ref}
      role="alert"
    >
      {children}
    </Text>
  );
};

/** A note that blocks nothing: worth knowing, under the field it is about. */
export const FormNote = ({ children }: { readonly children: string }) => (
  <Text
    accessibilityLiveRegion="polite"
    className="font-sans text-caption font-normal text-label-tertiary"
  >
    {children}
  </Text>
);
