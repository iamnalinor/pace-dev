import * as SecureStore from "expo-secure-store";

/** Bumped when the onboarding gains a step everyone should see once more. */
const KEY = "pace.onboarding.v1";

/** Whether this phone already went through the first-run permissions walk-through. */
export const isOnboarded = async (): Promise<boolean> => {
  try {
    return (await SecureStore.getItemAsync(KEY)) === "done";
  } catch {
    return false;
  }
};

export const markOnboarded = async (): Promise<void> => {
  await SecureStore.setItemAsync(KEY, "done");
};
