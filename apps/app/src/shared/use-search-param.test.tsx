import { act, renderHook } from "@testing-library/react-native";

import { paramsSet, searchParams, setSearchParams } from "#app/test/router.ts";

import { useSearchParam } from "./use-search-param.ts";

/** The browser's history step, in the order it is taken relative to the param's change. */
const mockSteps: string[] = [];
const mockAddress = { read: (): object => ({}) };
jest.mock("#app/platform/push-entry.ts", (): unknown => ({
  usePushEntry: () => () => {
    mockSteps.push(`step before ${JSON.stringify(mockAddress.read())}`);
  },
}));
mockAddress.read = searchParams;

beforeEach(() => {
  mockSteps.length = 0;
  paramsSet.mockClear();
});

describe("useSearchParam: Back and forward follow the screen (feedback 5 item 6, R24-02)", () => {
  it("takes a history step before each change it writes, so Back returns to what was shown", async () => {
    const { result } = await renderHook(() => useSearchParam("task"));
    await act(() => {
      result.current[1]("t1");
    });
    expect(searchParams()).toEqual({ task: "t1" });
    await act(() => {
      result.current[1](null);
    });
    expect(searchParams()).toEqual({});
    expect(mockSteps).toEqual(["step before {}", 'step before {"task":"t1"}']);
  });

  it("writes nothing, and takes no step, when the value is the one already shown", async () => {
    setSearchParams({ task: "t1" });
    const { result } = await renderHook(() => useSearchParam("task"));
    await act(() => {
      result.current[1]("t1");
    });
    expect(mockSteps).toEqual([]);
    expect(paramsSet).not.toHaveBeenCalled();
  });
});
