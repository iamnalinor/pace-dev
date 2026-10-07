import { mapSystemPath } from "#app/platform/native-intent.ts";

/** expo-router calls this for every incoming URL before routing (App Links, share intents). */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return mapSystemPath(path);
  } catch {
    return "/";
  }
}
