import { describe, expect, it } from "vitest";

import { actorCalls } from "./actor-call.ts";

describe("actor call ownership", () => {
  it("keeps one writer through external awaits and lets another actor progress", async () => {
    const first = actorCalls();
    const second = actorCalls();
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const order: string[] = [];
    const one = first(async () => {
      order.push("first:start");
      entered.resolve(undefined);
      await held.promise;
      order.push("first:end");
    });
    await entered.promise;
    const two = first(async () => {
      order.push("next");
      await Promise.resolve(undefined);
    });
    await second(async () => {
      order.push("other");
      await Promise.resolve(undefined);
    });
    expect(order).toEqual(["first:start", "other"]);
    held.resolve(undefined);
    await Promise.all([one, two]);
    expect(order).toEqual(["first:start", "other", "first:end", "next"]);
  });

  it("releases ownership after a failed operation", async () => {
    const run = actorCalls();
    await expect(
      run(async () => {
        await Promise.resolve(undefined);
        throw new Error("broken");
      }),
    ).rejects.toThrow("broken");
    expect(
      await run(async () => {
        await Promise.resolve(undefined);
        return 2;
      }),
    ).toBe(2);
  });
});
