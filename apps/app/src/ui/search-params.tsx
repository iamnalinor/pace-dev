import { createContext, type ReactNode, use, useMemo } from "react";

/** A screen's search params as its address holds them, decoded. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** What a navigator's `screenLayout` hands a screen's scene. */
export type SceneProps = {
  readonly children: ReactNode;
  /** The screen's route. */
  readonly route?: undefined | { readonly params?: object | undefined };
};

/** The params of the screen a component sits on; none outside any `ScreenScene`. */
const SearchParamsContext = createContext<SearchParams>({});

const decoded = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** The strings in a param's value (one, or a list of them), URI-decoded as `useLocalSearchParams` does. */
const stringsOf = (value: unknown): readonly string[] =>
  (Array.isArray(value) ? value : [value])
    .filter((each) => typeof each === "string")
    .map((each) => decoded(each));

/**
Hands a screen its route's search params as one object for as long as they say the same thing.
The router makes a new params object for the route it navigates to on every navigation, equal or
not; read straight from it (`useLocalSearchParams`), every screen rendered itself in full each
time it was entered, for nothing (bug-lessons 310). Here the params are compared by what they
say, so a screen is rendered for its address only when its address changed.
*/
export const SearchParamsScene = ({
  children,
  params,
}: {
  readonly children: ReactNode;
  /** The route's `params`, as the navigator's `screenLayout` gets them. */
  readonly params: object | undefined;
}) => {
  const said = JSON.stringify(
    Object.entries(params ?? {})
      .map(
        ([name, value]: readonly [string, unknown]) =>
          [name, Array.isArray(value) ? stringsOf(value) : stringsOf(value)[0]] as const,
      )
      .filter(([, value]) => value !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  );
  const stable = useMemo(
    () => Object.fromEntries(JSON.parse(said) as [string, string | string[]][]) as SearchParams,
    [said],
  );
  return <SearchParamsContext value={stable}>{children}</SearchParamsContext>;
};

/** The screen's search params, the same object until they change. */
export const useSceneSearchParams = (): SearchParams => use(SearchParamsContext);
