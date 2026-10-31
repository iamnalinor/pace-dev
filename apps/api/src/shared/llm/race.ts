import { err, ok, type Result } from "@pace/core";

/** One contender: it runs until `signal` aborts and calls `onFirstToken` when it starts answering. */
export type Attempt<T, F> = (run: {
  readonly signal: AbortSignal;
  readonly onFirstToken: () => void;
}) => Promise<Result<T, F>>;

export type RaceOptions<F> = {
  /** Silent (no first token) this long, the next attempt starts alongside. */
  readonly hedgeAfterMs: number;
  /** One attempt is cancelled after this long in all. */
  readonly giveUpAfterMs: number;
  readonly onFailure: (index: number, failure: F) => void;
  /** The whole race ends lost after this long (a webhook must answer in time); none by default. */
  readonly deadlineMs?: number;
};

/** Why a race was lost: every attempt failed, or the deadline came first. */
export type Lost = "deadline" | "failed";

/** The winner: its position in the list and its answer. */
export type Won<T> = { readonly index: number; readonly value: T };

/** Whether an attempt has already started the next one. */
type Link = { isHandedOff: boolean; readonly handOff: () => void };

/** One race's bookkeeping: how many started, how many still run, whether it is over. */
class HedgedRace<T, F> {
  private launched = 0;
  private running = 0;
  private isDone = false;
  private readonly cleanups: (() => void)[] = [];

  private readonly attempts: readonly Attempt<T, F>[];
  private readonly options: RaceOptions<F>;
  private readonly resolve: (result: Result<Won<T>, Lost>) => void;

  constructor(
    attempts: readonly Attempt<T, F>[],
    options: RaceOptions<F>,
    resolve: (result: Result<Won<T>, Lost>) => void,
  ) {
    this.attempts = attempts;
    this.options = options;
    this.resolve = resolve;
    if (options.deadlineMs === undefined) {
      return;
    }
    const deadline = setTimeout(() => {
      this.finish(err("deadline"));
    }, options.deadlineMs);
    this.cleanups.push(() => {
      clearTimeout(deadline);
    });
  }

  private finish(result: Result<Won<T>, Lost>): void {
    if (this.isDone) {
      return;
    }
    this.isDone = true;
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.resolve(result);
  }

  private finishIfAllFailed(): void {
    if (this.running === 0 && this.launched >= this.attempts.length) {
      this.finish(err("failed"));
    }
  }

  private settle(index: number, answer: null | Result<T, F>, link: Link): void {
    if (this.isDone) {
      return;
    }
    if (answer?.ok === true) {
      this.finish(ok({ index, value: answer.value }));
      return;
    }
    if (answer !== null) {
      this.options.onFailure(index, answer.error);
    }
    if (link.isHandedOff) {
      this.finishIfAllFailed();
    } else {
      link.handOff();
    }
  }

  /** The hedge (start the next one) and give-up (cancel this one) timers, and their stops. */
  private startTimers(
    controller: AbortController,
    link: Link,
  ): { readonly stopHedge: () => void; readonly stopAll: () => void } {
    const hedge = setTimeout(link.handOff, this.options.hedgeAfterMs);
    const giveUp = setTimeout(() => {
      controller.abort(new Error(`no answer in ${String(this.options.giveUpAfterMs)} ms`));
    }, this.options.giveUpAfterMs);
    this.cleanups.push(() => {
      clearTimeout(hedge);
      clearTimeout(giveUp);
      controller.abort();
    });
    return {
      stopAll: () => {
        clearTimeout(hedge);
        clearTimeout(giveUp);
      },
      stopHedge: () => {
        clearTimeout(hedge);
      },
    };
  }

  /** Starts the next attempt; past the last one, a race with nothing running is lost. */
  launchNext(): void {
    const index = this.launched;
    const attempt = this.attempts[index];
    if (attempt === undefined) {
      this.finishIfAllFailed();
      return;
    }
    this.launched += 1;
    this.running += 1;
    const controller = new AbortController();
    const link: Link = {
      handOff: () => {
        if (link.isHandedOff) {
          return;
        }

        link.isHandedOff = true;
        this.launchNext();
      },
      isHandedOff: false,
    };
    const timers = this.startTimers(controller, link);
    const run = async (): Promise<void> => {
      // The first token stops the hedge only; the give-up timer still bounds the whole answer.
      // An attempt should return its failure; one that throws still counts as failed.
      let answer: null | Result<T, F>;
      try {
        answer = await attempt({ onFirstToken: timers.stopHedge, signal: controller.signal });
      } catch {
        answer = null;
      }
      this.running -= 1;
      timers.stopAll();
      this.settle(index, answer, link);
    };
    void run();
  }
}

/**
A hedged race: the first attempt starts; when one fails, or has not started answering within
`hedgeAfterMs`, the next starts alongside it, and so on down the list. The first success wins
and cancels the rest; lost when every attempt failed or `deadlineMs` passed first.
*/
export const hedgedRace = async <T, F>(
  attempts: readonly Attempt<T, F>[],
  options: RaceOptions<F>,
): Promise<Result<Won<T>, Lost>> =>
  await new Promise((resolve) => {
    new HedgedRace(attempts, options, resolve).launchNext();
  });
