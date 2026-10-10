/** The router calls a screen makes, recorded for assertions. */
export const router = {
  back: jest.fn<undefined, []>(),
  canGoBack: jest.fn<boolean, []>(() => true),
  navigate: jest.fn<undefined, [string]>(),
  push: jest.fn<undefined, [string]>(),
  replace: jest.fn<undefined, [string]>(),
};

/** Stands in for `expo-router`: `jest.mock("expo-router", () => mockRouter.routerModule())`. */
export const routerModule = () => ({
  Redirect: () => null,
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  usePathname: () => "/",
  // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- stands in for expo-router's hook of this name
  useRouter: () => router,
});
