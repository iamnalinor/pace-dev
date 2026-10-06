export const DEVICE_ID_KEY = "pace.device";

const randomId = (): string =>
  typeof crypto.randomUUID === "function"
    ? `web-${crypto.randomUUID()}`
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A stable id for this browser profile; events record which device emitted them. */
export const readDeviceId = (): string => {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored !== null && stored !== "") {
      return stored;
    }
    const fresh = randomId();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
};
