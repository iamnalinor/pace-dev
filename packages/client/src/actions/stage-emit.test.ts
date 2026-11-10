import { afterEach, describe, expect, it, vi } from "vitest";

import { newId } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { createMemoryEventStore } from "../adapters/memory-event-store.ts";
import { createAppState } from "../state.ts";
import { emit } from "./deps.ts";

/*
The event an action checks is the event it stages (PR 55 review I7). The check used to run on a
stand-in envelope with its own random id, so a same-instant tie with a checkpoint's last event was
decided on an id the staged event never had.
*/

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The ULID a monotonic factory makes right after `id` within one millisecond. */
const successor = (id: string): string => {
  for (let index = id.length - 1; index >= 0; index--) {
    const value = CROCKFORD.indexOf(id.charAt(index));
    if (value < CROCKFORD.length - 1) {
      const zeros = "0".repeat(id.length - index - 1);
      return `${id.slice(0, index)}${CROCKFORD.charAt(value + 1)}${zeros}`;
    }
  }
  return id;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("an action's envelope", () => {
  it("is made once: the staged event carries the very id its checks ran on", async () => {
    const state = createAppState({
      deviceId: "dev-1",
      now: () => NOW,
      source: "web",
      store: createMemoryEventStore(),
    });
    await state.ready;
    // One frozen millisecond: every id after `before` is its successor, in the order drawn.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
    const before = newId();
    const result = await emit(
      { clock: { deviceTz: "UTC", now: () => NOW }, source: "web", state },
      [
        {
          occurredAt: NOW,
          payload: { language: "ru" },
          precision: "exact",
          source: "web",
          type: "settings.updated",
        },
      ],
    );
    expect(result).toMatchObject({ ok: true, value: [{ id: successor(before) }] });
    expect(newId()).toBe(successor(successor(before)));
  });
});
