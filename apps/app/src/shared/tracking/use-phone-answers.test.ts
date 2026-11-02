import { act, renderHook } from "@testing-library/react-native";

import { useLatestLoad } from "./use-phone-answers.ts";

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
