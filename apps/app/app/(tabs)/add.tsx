import { useSharedIn } from "#app/platform/shared-in.ts";
import { NowScreen } from "#app/screens/now-screen.tsx";

/** The Add tab and the share target: Now with the shared text already in the composer. */
export default function AddRoute() {
  return <NowScreen composeText={useSharedIn()} />;
}
