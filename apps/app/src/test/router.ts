/** The router calls a screen makes, recorded for assertions. */
export const router = {
  back: jest.fn<void, []>(),
  canGoBack: jest.fn<boolean, []>(() => true),
  push: jest.fn<void, [string]>(),
  replace: jest.fn<void, [string]>(),
};

/** Stands in for `expo-router`: `jest.mock("expo-router", () => mockRouter.routerModule())`. */
export const routerModule = () => ({
  Redirect: () => null,
  useRouter: () => router,
});
