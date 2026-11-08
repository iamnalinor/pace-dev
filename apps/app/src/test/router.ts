import {
  cloneElement,
  type EffectCallback,
  type ReactElement,
  useEffect,
  useSyncExternalStore,
} from "react";

type Params = Readonly<Record<string, string | undefined>>;

/**
The screen's search params, as the address holds them: `router.setParams` writes them (an
`undefined` value takes one off), `useLocalSearchParams` reads them. Emptied before every test.
*/
const address = {
  listeners: new Set<() => void>(),
  params: {} as Readonly<Record<string, string>>,
};

const tell = (): void => {
  for (const listener of address.listeners) {
    listener();
  }
};

/** Sets the address's search params outright, as a page load with that address would. */
export const setSearchParams = (params: Readonly<Record<string, string>>): void => {
  address.params = { ...params };
  tell();
};

/** The search params the address holds now. */
export const searchParams = (): Readonly<Record<string, string>> => address.params;

/** Every `router.setParams` call, for assertions (the merge itself is not a mock, so it survives a restore). */
export const paramsSet = jest.fn<undefined, [Params]>();

const setParams = (params: Params): void => {
  paramsSet(params);
  const merged: Record<string, string> = { ...address.params };
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- an undefined param leaves the address
      delete merged[name];
    } else {
      merged[name] = value;
    }
  }
  address.params = merged;
  tell();
};

const subscribe = (listener: () => void): (() => void) => {
  address.listeners.add(listener);
  return () => {
    address.listeners.delete(listener);
  };
};

/** The router calls a screen makes, recorded for assertions. */
export const router = {
  back: jest.fn<undefined, []>(),
  canGoBack: jest.fn<boolean, []>(() => true),
  navigate: jest.fn<undefined, [string]>(),
  push: jest.fn<undefined, [string]>(),
  replace: jest.fn<undefined, [string]>(),
  setParams,
};

/** The hrefs a `<Redirect>` was rendered with, for assertions. */
export const redirected = jest.fn<undefined, [string]>();

/** Stands in for `expo-router`: `jest.mock("expo-router", () => mockRouter.routerModule())`. */
export const routerModule = () => ({
  /** `Link asChild`: the child is pressed to the address, as expo-router's Slot hands it over. */
  Link: ({ children, href }: { readonly children: ReactElement; readonly href: string }) =>
    // eslint-disable-next-line @eslint-react/no-clone-element -- stands in for expo-router's Slot, which merges props into its one child
    cloneElement(children as ReactElement<{ href?: string; onPress?: () => void }>, {
      href,
      onPress: () => {
        router.navigate(href);
      },
    }),
  Redirect: ({ href }: { readonly href: string }) => {
    redirected(href);
    return null;
  },
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  usePathname: () => "/",

  useLocalSearchParams: () => useSyncExternalStore(subscribe, searchParams),
  // A mounted screen is focused: the effect runs as it would on focus.
  useFocusEffect: (effect: EffectCallback) => {
    useEffect(effect, [effect]);
  },
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  useIsFocused: () => true,
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  useRouter: () => router,
});
