import { useServices } from "#web/app-state.tsx";

/** The account zone (null until the first sync), this device's zone, now, and the switch. */
export const useZones = () => {
  const { actions, clock, hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { now } = hooks.useClock();
  return {
    account: timezone,
    device: clock.deviceTz,
    now,
    switchToDevice: async (): Promise<void> => {
      await actions.setTimezone(clock.deviceTz);
    },
  };
};
