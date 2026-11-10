import type { OtaCoordinator } from "./ota-coordinator.ts";

export type OtaForeground = { readonly subscribe: (onActive: () => void) => () => void };

/** Start once per coordinator lifetime, independently from account login and server selection. */
export const startOtaLifecycle = (
  coordinator: OtaCoordinator,
  foreground: OtaForeground,
): (() => void) => {
  coordinator.activate?.();
  const onActive = (): void => {
    void coordinator.check();
  };
  const unsubscribe = foreground.subscribe(onActive);
  onActive();
  return () => {
    unsubscribe();
    coordinator.dispose();
  };
};
