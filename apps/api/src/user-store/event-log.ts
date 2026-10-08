import { type Event, ok, parseEvent, type Result, type SyncEvent } from "@pace/core";

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

const idOf = (raw: unknown): string =>
  typeof raw === "object" && raw !== null && "id" in raw ? String(raw.id) : "";

export type ScreenedBatch = {
  readonly events: readonly Event[];
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
};

/**
Sorts a pushed batch into the events that may be stored and the ones refused (with why); the
validator seam may be wider than the core schema, storage never is.
*/
export const screenBatch = (raw: readonly unknown[], options: NormalizeOptions): ScreenedBatch => {
  const results = raw.map((item) => {
    const normalized = normalizeEvent(item, options);
    return { item, parsed: normalized.ok ? parseEvent(normalized.value) : normalized };
  });
  const events = results
    .map(({ parsed }) => parsed)
    .filter((parsed) => parsed.ok)
    .map((parsed) => parsed.value);
  return {
    accepted: events.map((event) => event.id),
    events,
    rejected: results
      .filter(({ parsed }) => !parsed.ok)
      .map(({ item, parsed }) => ({ id: idOf(item), reason: parsed.ok ? "" : parsed.error })),
  };
};
