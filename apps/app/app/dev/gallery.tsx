import { useLocalSearchParams } from "expo-router";
import { lazy, Suspense } from "react";

import type { Language, ThemeName } from "@pace/core";
import type { GallerySet } from "@pace/core/testing";

import { NotFoundScreen } from "#app/screens/not-found-screen.tsx";

/*
The worst-case gallery is a dev tool. `EXPO_PUBLIC_DEV_LOGIN` is a build-time constant that the
bundler inlines, so in any other build this condition is false, the branch (the `import()` and
the chunk behind it) is dropped, and the route is the not-found screen.
*/
const Gallery =
  process.env["EXPO_PUBLIC_DEV_LOGIN"] === "1"
    ? lazy(async () => {
        const { GalleryScreen } = await import("#app/screens/gallery/gallery-screen.tsx");
        return { default: GalleryScreen };
      })
    : null;

const SETS: readonly GallerySet[] = ["demo", "worst", "empty", "one"];
const LANGUAGES: readonly Language[] = ["ru", "en"];
const THEMES: readonly ThemeName[] = ["light", "dark"];

/** The URL's choice when it is one of `choices`, else the first. */
const pick = <T extends string>(
  choices: readonly T[],
  fallback: T,
  value: string | string[] | undefined,
): T => choices.find((choice) => choice === value) ?? fallback;

export default function GalleryRoute() {
  const params = useLocalSearchParams<{ lang?: string; set?: string; theme?: string }>();
  if (Gallery === null) {
    return <NotFoundScreen />;
  }
  return (
    <Suspense fallback={null}>
      <Gallery
        language={pick(LANGUAGES, "en", params.lang)}
        set={pick(SETS, "demo", params.set)}
        theme={pick(THEMES, "light", params.theme)}
      />
    </Suspense>
  );
}
