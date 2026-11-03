import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Stack, usePathname } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Linking, Text } from "react-native";

import { Link } from "./link.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.unmock("expo-router");

const routes = (link: React.ReactNode) => ({
  index: () => <ThemeProvider forced="light">{link}</ThemeProvider>,
  week: () => <Text>Week screen</Text>,
});

/** A page that says where it is, with a link to Week. */
const Page = () => (
  <ThemeProvider forced="light">
    <Text>{`at ${usePathname()}`}</Text>
    <Link href="/week" label="Week">
      <Text>Week</Text>
    </Link>
  </ThemeProvider>
);

describe("Link (spec §4.1.1)", () => {
  it("is a link with the kit's state layer that goes to its address", async () => {
    await renderRouter(
      routes(
        <Link className="rounded-md" href="/week">
          <Text>Week</Text>
        </Link>,
      ),
    );
    const link = screen.getByRole("link", { name: "Week" });
    expect(link.props["className"]).toContain("shrink-0");
    await fireEvent.press(link);
    expect(await screen.findByText("Week screen")).toBeOnTheScreen();
  });

  it("opens an address outside the app in the browser", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderRouter(
      routes(
        <Link href="https://example.com/algebra" label="Algebra">
          <Text>example.com</Text>
        </Link>,
      ),
    );
    await fireEvent.press(screen.getByRole("link", { name: "Algebra" }));
    expect(open).toHaveBeenCalledWith("https://example.com/algebra");
    open.mockRestore();
  });

  it("navigates rather than pushes: an open destination is shown again, not stacked twice (the sidebar's rule)", async () => {
    await renderRouter({ _layout: () => <Stack />, index: Page, week: Page }, { initialUrl: "/" });
    await fireEvent.press(screen.getByRole("link", { name: "Week" }));
    expect(await screen.findByText("at /week")).toBeOnTheScreen();
    // Pressed again on the open destination: one Week above Now still, so Back leads to Now.
    await fireEvent.press(screen.getAllByRole("link", { name: "Week" }).at(-1) as never);
    await act(async () => {
      router.back();
    });
    expect(await screen.findByText("at /")).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
  });
});
