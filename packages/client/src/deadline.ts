/**
How long a screen's own request to the server may take before it says it failed (a line and Try
again) instead of loading for good (bug class 62). A list or a page of details comes back in well
under a second; the sync has its own `HTTP_SYNC_TIMEOUT_MS`, the assistant thinks longer.
*/
export const REQUEST_DEADLINE_MS = 15_000;

/** The request got no answer in time and was aborted. */
export class NoAnswerInTime extends Error {
  constructor() {
    super("no answer in time");
    this.name = "NoAnswerInTime";
  }
}

/** Runs `call`, aborting its signal and rejecting with `NoAnswerInTime` once the deadline passes. */
export const withinDeadline = async <T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timers: { stalled?: ReturnType<typeof setTimeout> } = {};
  // A request whose fetch ignores the abort (or never settles) is still given up on.
  const stalled = new Promise<never>((_resolve, reject) => {
    timers.stalled = setTimeout(() => {
      controller.abort();
      reject(new NoAnswerInTime());
    }, REQUEST_DEADLINE_MS);
  });
  try {
    return await Promise.race([call(controller.signal), stalled]);
  } finally {
    clearTimeout(timers.stalled);
  }
};
