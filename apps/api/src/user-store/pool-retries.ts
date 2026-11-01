import * as deliveries from "./delivery-rows.ts";
import { deliverNew, hasSendRetry, type PoolDeps } from "./notification-pool.ts";
import * as rows from "./pool-rows.ts";
import { hasPendingAfterWithdraw } from "./pool-withdraw.ts";

/** Takes back again every copy of a resolved notification whose withdrawal is still pending. */
const retryDismissals = async (deps: PoolDeps): Promise<void> => {
  const pendingIds = await deliveries.pendingDismissalIds(deps.db);
  for (const id of pendingIds) {
    const stored = await rows.findNotification(deps.db, id);
    if (stored === undefined) {
      continue;
    }
    await hasPendingAfterWithdraw(deps, stored, {
      origin: "system",
      resolution: stored.notification.resolution ?? "read",
    });
  }
};

/**
A pool pass's delivery retries: sends again the copies that failed and takes back again the
withdrawals still pending, then answers whether any is still outstanding (the pass then looks
again a minute on: `scheduleNextPass`).
*/
export const hasPendingAfterRetry = async (deps: PoolDeps): Promise<boolean> => {
  const open = await rows.openNotifications(deps.db);
  for (const stored of open) {
    if (await hasSendRetry(deps, stored.notification)) {
      await deliverNew(deps, stored);
    }
  }
  await retryDismissals(deps);
  const remaining = await rows.openNotifications(deps.db);
  for (const { notification } of remaining) {
    if (await hasSendRetry(deps, notification)) {
      return true;
    }
  }
  const pending = await deliveries.pendingDismissalIds(deps.db);
  return pending.length > 0;
};
