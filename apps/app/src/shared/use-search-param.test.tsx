import { act, renderHook } from "@testing-library/react-native";

import { paramsSet, searchParams, setSearchParams } from "#app/test/router.ts";

import { useSearchParam } from "./use-search-param.ts";

/** The browser's history step, in the order it is taken relative to the param's change. */
const mockSteps: string[] = [];
const mockAddress = { read: (): object => ({}) };
/** Whether the entry before is the screen without the param (the web build's answer). */
const mockBack = { canStepBack: false };
jest.mock("#app/platform/push-entry.ts", (): unknown => ({
  usePushEntry: () => () => {
    mockSteps.push(`step before ${JSON.stringify(mockAddress.read())}`);
  },
  useStepBack: () => (name: string) => {
    mockSteps.push(`step back over ${name}`);
    return mockBack.canStepBack;
  },
}));
mockAddress.read = searchParams;

beforeEach(() => {
  mockBack.canStepBack = false;
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

  it("forgets a param whose item is gone without a step: back over the step that opened it, else in place (review I2)", async () => {
    setSearchParams({ open: "n1", other: "x" });
    const { result } = await renderHook(() => useSearchParam("open"));
    mockBack.canStepBack = true;
    await act(() => {
      result.current[2]();
    });
    // The navigator took the step back; nothing is written here.
    expect(mockSteps).toEqual(["step back over open"]);
    expect(paramsSet).not.toHaveBeenCalled();
    mockBack.canStepBack = false;
    await act(() => {
      result.current[2]();
    });
    expect(searchParams()).toEqual({ other: "x" });
    expect(mockSteps).toEqual(["step back over open", "step back over open"]);
  });

  it("forgets nothing when the param is not there", async () => {
    const { result } = await renderHook(() => useSearchParam("open"));
    await act(() => {
      result.current[2]();
    });
    expect(mockSteps).toEqual([]);
    expect(paramsSet).not.toHaveBeenCalled();
  });
});
