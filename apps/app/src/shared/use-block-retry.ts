import { useEffect, useEffectEvent, useRef } from "react";

import { useSyncRetryReason } from "#app/ui/sync-frame.tsx";

/**
A screen's own read that failed (screen time, the calendar layer, the complete history) while the
sync line offers its Retry: the failure says what did not load with no button of its own, since
the line's Retry is the one control for the job (QA PR55-1-09: two «Попробовать снова» for one
offline state); and the read is made again as soon as the line goes (its Retry worked, or the
network came back), so nothing stays failed once the server answers. Answers the screen's own
retry when the line offers none, `null` while it does.
*/
export const useBlockRetry = (read: {
  readonly isFailed: boolean;
  readonly retry: () => void;
}): (() => void) | null => {
  const isLineRetry = useSyncRetryReason() !== null;
  const readAgain = useEffectEvent(() => {
    if (read.isFailed) {
      read.retry();
    }
  });
  const lineRetryBeforeRef = useRef(isLineRetry);
  useEffect(() => {
    if (!isLineRetry && lineRetryBeforeRef.current) {
      readAgain();
    }
    lineRetryBeforeRef.current = isLineRetry;
  }, [isLineRetry]);
  return isLineRetry ? null : read.retry;
};
