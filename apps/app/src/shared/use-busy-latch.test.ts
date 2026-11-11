import { act, renderHook } from "@testing-library/react-native";

import { useBusyLatch } from "./use-busy-latch.ts";

it("runs one press at a time, busy while it runs, and idle again after a failure", async () => {
  const { result } = await renderHook(() => useBusyLatch());
  const answer = Promise.withResolvers<undefined>();
  const work = jest.fn(async () => {
    await answer.promise;
  });
  let first: Promise<void> | undefined;
  await act(async () => {
    first = result.current.run(work);
    void result.current.run(work);
    await Promise.resolve();
  });
  expect(work).toHaveBeenCalledTimes(1);
  expect(result.current.isBusy).toBe(true);
  await act(async () => {
    answer.resolve(undefined);
    await first;
  });
  expect(result.current.isBusy).toBe(false);
  await act(async () => {
    await expect(
      result.current.run(() => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
  });
  expect(result.current.isBusy).toBe(false);
});

it("stays busy after a run that holds (the app is restarting)", async () => {
  const { result } = await renderHook(() => useBusyLatch());
  const work = jest.fn((): "hold" => "hold");
  await act(async () => {
    await result.current.run(work);
  });
  await act(async () => {
    await result.current.run(work);
  });
  expect(work).toHaveBeenCalledTimes(1);
  expect(result.current.isBusy).toBe(true);
});
