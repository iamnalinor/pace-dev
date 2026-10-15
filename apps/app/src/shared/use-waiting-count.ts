import { usePace } from "#app/app-state.tsx";
import { waitingCount } from "@pace/client";

/**
What waits on the person in the Inbox (`waitingCount`: the captures plus the decisions the rules
want), read from the Inbox's own view-models, as its screen lists them. The badge on the Inbox in
the sidebar and on the phone's tab bar shows it; it hides at zero.
*/
export const useWaitingCount = (): number => {
  const { hooks } = usePace();
  return waitingCount(hooks.useInbox(), hooks.useReview());
};
