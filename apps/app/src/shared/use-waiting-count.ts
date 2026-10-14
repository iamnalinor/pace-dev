import { usePace } from "#app/app-state.tsx";
import { decisionsOf } from "#app/screens/review-card.tsx";

/**
What waits on the person in the Inbox: the unsorted captures plus the decisions the rules want.
The badge on the Inbox in the sidebar and on the phone's tab bar shows it; it hides at zero.
*/
export const useWaitingCount = (): number => {
  const { hooks } = usePace();
  return hooks.useNow().inboxCount + decisionsOf(hooks.useReview().items).length;
};
