/** A call its caller gave up on before it was sent, named as a fetch's abort is. */
class CallAborted extends Error {
  constructor() {
    super("The call was aborted");
    this.name = "AbortError";
  }
}

/** What a fetch rejects with once its caller aborted: the caller's reason, else an `AbortError`. */
const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new CallAborted();

/**
Waits for a check of the session under way, whatever its answer (a check that fails is not the
call's failure), or until the caller gives up: the sync's timeout or an unmount releases the call at
once (CI fix review I1, m1).
*/
export const heldUntilChecked = async (
  checking: Promise<unknown>,
  signal: AbortSignal | undefined,
): Promise<void> => {
  const answered = (async (): Promise<void> => {
    try {
      await checking;
    } catch {
      // The check's own failure: the call goes on with the session in use, as after any answer.
    }
  })();
  if (signal === undefined) {
    await answered;
    return;
  }
  if (signal.aborted) {
    throw abortReason(signal);
  }
  const listener: { onAbort?: () => void } = {};
  const given = new Promise<never>((_resolve, reject) => {
    listener.onAbort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", listener.onAbort, { once: true });
  });
  try {
    await Promise.race([answered, given]);
  } finally {
    if (listener.onAbort !== undefined) {
      signal.removeEventListener("abort", listener.onAbort);
    }
  }
};
