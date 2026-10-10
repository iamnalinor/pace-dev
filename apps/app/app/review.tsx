import { Redirect } from "expo-router";

/** "To sort" lives on the Inbox now (above the captures); an old link lands there. */
export default function ReviewRoute() {
  return <Redirect href="/inbox" />;
}
