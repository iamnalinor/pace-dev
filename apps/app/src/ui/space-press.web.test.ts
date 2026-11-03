import { spacePress } from "./space-press.web.ts";

const key = (name: string, extra: Record<string, unknown> = {}) => {
  const target = {};
  return {
    event: { currentTarget: target, key: name, preventDefault: jest.fn(), target, ...extra },
    target,
  };
};

describe("spacePress (react-native-web only presses a switch, radio or checkbox on Enter)", () => {
  it("presses on Space and keeps the page from scrolling", () => {
    const onPress = jest.fn();
    const { event } = key(" ");
    spacePress(onPress).onKeyDown?.(event);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("leaves every other key to the browser and to Enter's own path", () => {
    const onPress = jest.fn();
    for (const name of ["Enter", "a", "Tab", "ArrowRight"]) {
      const { event } = key(name);
      spacePress(onPress).onKeyDown?.(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(onPress).not.toHaveBeenCalled();
  });

  it("presses once per key, not once per repeat while it is held", () => {
    const onPress = jest.fn();
    const { event } = key(" ", { repeat: true });
    spacePress(onPress).onKeyDown?.(event);
    expect(onPress).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ignores a Space typed in something inside the control", () => {
    const onPress = jest.fn();
    const { event } = key(" ", { target: {} });
    spacePress(onPress).onKeyDown?.(event);
    expect(onPress).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing for a control with no action", () => {
    const { event } = key(" ");
    spacePress(undefined).onKeyDown?.(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
