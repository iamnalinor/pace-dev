import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";

import { Link } from "./link.web.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.unmock("expo-router");

const routes = (link: React.ReactNode) => ({
  index: () => <ThemeProvider forced="light">{link}</ThemeProvider>,
  week: () => <Text>Week screen</Text>,
});

/**
The web's Link is an `<a href>` (react-native-web renders an element with `href` as an anchor), so
Ctrl/⌘-click and middle-click open a new tab (F-WEB-03). The browser half is `e2e/link.e2e.ts`.
*/
describe("Link on the web", () => {
  it("carries its address as href, and still navigates in place on a press", async () => {
    await renderRouter(
      routes(
        <Link href="/week">
          <Text>Week</Text>
        </Link>,
      ),
    );
    const link = screen.getByRole("link", { name: "Week" });
    expect(link.props["href"]).toBe("/week");
    expect(link.props["hrefAttrs"]).toEqual({ rel: undefined, target: undefined });
    await fireEvent.press(link);
    expect(await screen.findByText("Week screen")).toBeOnTheScreen();
  });

  it("has no address while disabled: the browser would follow an href the press refuses", async () => {
    await renderRouter(
      routes(
        <Link disabled href="/week">
          <Text>Week</Text>
        </Link>,
      ),
    );
    const link = screen.getByRole("link", { name: "Week" });
    expect(link.props["href"]).toBeUndefined();
    expect(link).toBeDisabled();
    await fireEvent.press(link);
    expect(screen.queryByText("Week screen")).toBeNull();
  });

  it("is disabled by `aria-disabled` as by `disabled`: no live href either way (3.2 re-review)", async () => {
    await renderRouter(
      routes(
        // A hyphenated attribute passes any JSX type: the kit reads it as the disabled state.
        <Link aria-disabled href="/week">
          <Text>Week</Text>
        </Link>,
      ),
    );
    const link = screen.getByRole("link", { name: "Week" });
    expect(link.props["href"]).toBeUndefined();
    expect(link).toBeDisabled();
    await fireEvent.press(link);
    expect(screen.queryByText("Week screen")).toBeNull();
  });

  it("takes no other disabled state than `disabled` and `aria-disabled`", () => {
    const typed = [
      <Link disabled href="/week" key="disabled" />,
      // @ts-expect-error -- `accessibilityState` is the kit's to set
      <Link accessibilityState={{ disabled: true }} href="/week" key="state" />,
    ];
    expect(typed).toHaveLength(2);
  });

  it("opens an address outside the app in a new tab, without the opener", async () => {
    await renderRouter(
      routes(
        <Link href="https://example.com/algebra" label="Algebra">
          <Text>example.com</Text>
        </Link>,
      ),
    );
    const link = screen.getByRole("link", { name: "Algebra" });
    expect(link.props["href"]).toBe("https://example.com/algebra");
    expect(link.props["hrefAttrs"]).toEqual({ rel: "noopener", target: "_blank" });
  });
});
