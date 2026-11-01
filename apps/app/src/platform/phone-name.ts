import Constants from "expo-constants";

/** How this phone is named next to the computers in Settings: its model, or "Android". */
export const phoneName = (): string => {
  const name = (Constants.deviceName ?? "").trim();
  return name === "" ? "Android" : name;
};
