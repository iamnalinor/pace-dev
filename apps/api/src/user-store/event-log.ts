import { ok, parseEvent, type Result, type SyncEvent } from "@pace/core";

/**
The validation seam of the log: decides whether a raw envelope may be appended.
The default is the core event schema (per-type payloads, ULID or system ids, UTC
instants); unknown event types never reach storage.
*/
export type EventValidator = (raw: unknown) => Result<SyncEvent, string>;

export const coreValidator: EventValidator = (raw) => parseEvent(raw);

export type NormalizeOptions = {
  /** Server time as ISO; a `recordedAt` after it is clock skew and is clamped. */
  readonly now: string;
  readonly validateEvent: EventValidator;
};

/** Validates one incoming envelope and clamps a future `recordedAt` to the server clock. */
export const normalizeEvent = (
  raw: unknown,
  options: NormalizeOptions,
): Result<SyncEvent, string> => {
  const validated = options.validateEvent(raw);
  if (!validated.ok) {
    return validated;
  }
  const event = validated.value;
  return Date.parse(event.recordedAt) > Date.parse(options.now)
    ? ok({ ...event, recordedAt: options.now })
    : validated;
};
