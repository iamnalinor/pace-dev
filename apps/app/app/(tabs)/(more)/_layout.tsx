import { MoreStack } from "#app/ui/more-stack.tsx";

/**
More's list under every destination it opens, a link straight to one included: Back from Week
(opened from a notification, say) leads to More.
*/
// eslint-disable-next-line @typescript-eslint/naming-convention -- the name expo-router reads
export const unstable_settings = { initialRouteName: "more" };

/** The More tab: its list and its destinations, under the phone's tab bar. */
export default function MoreLayout() {
  return <MoreStack />;
}
