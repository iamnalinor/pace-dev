import { cloneElement, type EffectCallback, type ReactElement, useEffect } from "react";

/** The router calls a screen makes, recorded for assertions. */
export const router = {
  back: jest.fn<undefined, []>(),
  canGoBack: jest.fn<boolean, []>(() => true),
  navigate: jest.fn<undefined, [string]>(),
  push: jest.fn<undefined, [string]>(),
  replace: jest.fn<undefined, [string]>(),
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
  // A mounted screen is focused: the effect runs as it would on focus.
  useFocusEffect: (effect: EffectCallback) => {
    useEffect(effect, [effect]);
  },
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  useIsFocused: () => true,
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  useRouter: () => router,
});
