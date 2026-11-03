import type { PaceRuntime } from "./runtime.ts";

/**
The local copy (IndexedDB, shared by a browser's tabs) goes on sign-out only when no session is
left in the shared store, and only while it is still the leaving session's: a stale tab's late
401 never wipes the copy of the tab that signed in since (round 6 I1), even when that tab signs
in between the check and the wipe (the owner is compared in the clear's own transaction,
re-review N3). A different account there gets a new store id, and its first pull drops the old
copy on its own.
*/
export const dropLocalCopyIfOwned = async (
  runtime: PaceRuntime,
  leaving: string | undefined,
): Promise<void> => {
  if (await runtime.auth.isSessionStored()) {
    return;
  }
  await (leaving === undefined ? runtime.resetLocalData() : runtime.dropLocalCopyOf(leaving));
};

/**
Marks the copy as this session's. A store that refuses the write leaves the mark as it was (none
after a sign-out's clear, which a stale tab's sign-out treats as anyone's, the rule before owners):
the start goes on.
*/
export const claimLocalCopy = async (
  runtime: PaceRuntime,
  session: string | undefined,
): Promise<void> => {
  if (session === undefined) {
    return;
  }
  try {
    await runtime.claimLocalCopy(session);
  } catch {
    // The mark stays as it was: see above.
  }
};
