import { useShareIntentContext } from "expo-share-intent";

import { NowScreen } from "#app/screens/now-screen.tsx";

/** The Add tab and the share target: Now with the shared text already in the composer. */
export default function AddRoute() {
  const { shareIntent } = useShareIntentContext();
  const shared = [shareIntent.text, shareIntent.webUrl]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
  return <NowScreen composeText={shared} />;
}
