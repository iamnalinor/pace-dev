export const DEVICE_ID_KEY = "pace.device";

const randomId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `web-${hex}`;
};

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
