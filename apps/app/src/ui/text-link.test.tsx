import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { TextLink } from "./text-link.tsx";
import { TextLink as WebTextLink } from "./text-link.web.tsx";
import { Text } from "./text.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

describe("TextLink: an address inside a run of text (feedback 5 item 8)", () => {
  it("on a phone, is a link named by its words that opens the address in the browser, not the text's own press", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const onText = jest.fn();
    await render(
      <ThemeProvider forced="light">
        <Text onPress={onText} role="body">
          {"See "}
          <TextLink url="https://example.com/a">example.com/a</TextLink>
        </Text>
      </ThemeProvider>,
    );
    const link = screen.getByRole("link", { name: "example.com/a" });
    await fireEvent.press(link);
    expect(open).toHaveBeenCalledWith("https://example.com/a");
    expect(onText).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("on the web, is an anchor to a new tab whose click stays its own", async () => {
    const onText = jest.fn();
    await render(
      <ThemeProvider forced="light">
        <Text onPress={onText} role="body">
          <WebTextLink url="https://example.com/a">example.com/a</WebTextLink>
        </Text>
      </ThemeProvider>,
    );
    const link = screen.getByRole("link", { name: "example.com/a" });
    expect(link.props["href"]).toBe("https://example.com/a");
    expect(link.props["hrefAttrs"]).toEqual({ rel: "noopener", target: "_blank" });
    const stopPropagation = jest.fn();
    await fireEvent.press(link, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  });
});
