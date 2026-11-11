import { act, renderHook } from "@testing-library/react-native";

import { dismiss as rememberDismissed } from "#app/platform/phone-memory.ts";

import { useLatestLoad, usePhoneAnswers } from "./use-phone-answers.ts";

jest.mock("#app/platform/phone-memory.ts", () => ({
  dismiss: jest.fn(async () => undefined),
  setSeriesRule: jest.fn(async () => undefined),
}));

const setup = async () => {
  const applied: string[] = [];
  const { result } = await renderHook(() =>
    useLatestLoad<string>((value) => {
      applied.push(value);
    }),
  );
  return { applied, load: result.current };
};

describe("useLatestLoad", () => {
  it("keeps what is shown when a read fails, and answers without a rejection", async () => {
    const { applied, load } = await setup();
    await act(async () => {
      await load(async () => "first");
    });
    await act(async () => {
      await expect(
        load(async () => {
          throw new Error("unreadable");
        }),
      ).resolves.toBe(undefined);
    });
    expect(applied).toEqual(["first"]);
  });

  it("never lets an earlier read that finishes last overwrite a later one", async () => {
    const { applied, load } = await setup();
    const slow = Promise.withResolvers<string>();
    let earlier: Promise<void> = Promise.resolve();
    await act(async () => {
      earlier = load(async () => await slow.promise);
      await load(async () => "later");
    });
    await act(async () => {
      slow.resolve("earlier");
      await earlier;
    });
    expect(applied).toEqual(["later"]);
  });
});

describe("usePhoneAnswers skip", () => {
  it("sends one skip for two presses before the hide renders (class 374)", async () => {
    const { result } = await renderHook(() => usePhoneAnswers(async () => undefined, 0));
    const server = Promise.withResolvers<boolean>();
    const wasTaken = jest.fn(async () => await server.promise);
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.skip("event-a", wasTaken);
      second = result.current.skip("event-a", wasTaken);
      await Promise.resolve();
    });
    expect(result.current.dismissed.has("event-a")).toBe(true);
    await act(async () => {
      server.resolve(true);
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(true);
    });
    expect(wasTaken).toHaveBeenCalledTimes(1);
    expect(rememberDismissed).toHaveBeenCalledTimes(1);
  });
});
