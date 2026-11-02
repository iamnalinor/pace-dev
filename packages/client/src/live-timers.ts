/** What the keep-alive needs of a socket: a way to send its ping. */
type Pingable = { readonly send: (data: string) => void };

/** Often enough that no proxy closes an idle socket; the server answers without waking. */
const PING_MS = 45_000;

/**
A ping whose "pong" has not come by then means the socket went quiet (a network switch leaves it
half-open, reading as connected): it is dropped and reconnected, instead of waiting for the safety
poll minutes later (QA round 16 L1). The server's auto-response answers without waking it.
*/
export const PONG_WAIT_MS = 10_000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 60_000;

/** The keep-alive and reconnect timers of one channel. */
export type LiveTimers = {
  readonly clear: () => void;
  readonly keepAlive: (socket: Pingable, onQuiet: (streak: number) => void) => void;
  readonly ponged: () => void;
  readonly retryIn: (delayMs: number, connect: () => void) => void;
};

/** A dropped socket comes back after 1 s, 2 s, 4 s, … at most a minute. */
export const retryDelay = (failures: number): number =>
  Math.min(RETRY_MIN_MS * 2 ** (failures - 1), RETRY_MAX_MS);

/**
The keep-alive (a ping, then its pong in time or `onQuiet`) and the pending reconnect. `onQuiet`
hears how many sockets in a row went quiet without a pong, so a slow link or a proxy that drops
text frames backs off instead of reconnecting every minute (fix round 1); a pong resets it.
*/
export const createTimers = (): LiveTimers => {
  let ping: ReturnType<typeof setInterval> | undefined;
  let pong: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let quietStreak = 0;
  return {
    clear: (): void => {
      clearInterval(ping);
      clearTimeout(pong);
      clearTimeout(retry);
      ping = undefined;
      pong = undefined;
      retry = undefined;
    },
    keepAlive: (socket: Pingable, onQuiet: (streak: number) => void): void => {
      ping = setInterval(() => {
        clearTimeout(pong);
        pong = setTimeout(() => {
          quietStreak += 1;
          onQuiet(quietStreak);
        }, PONG_WAIT_MS);
        socket.send("ping");
      }, PING_MS);
    },
    /** The pong came: the line is alive. */
    ponged: (): void => {
      clearTimeout(pong);
      pong = undefined;
      quietStreak = 0;
    },
    retryIn: (delayMs: number, connect: () => void): void => {
      retry = setTimeout(connect, delayMs);
    },
  };
};
