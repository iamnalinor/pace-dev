import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Linking, Text } from "react-native";

import { Link } from "./link.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.unmock("expo-router");

const routes = (link: React.ReactNode) => ({
  index: () => <ThemeProvider forced="light">{link}</ThemeProvider>,
  week: () => <Text>Week screen</Text>,
});

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
});
