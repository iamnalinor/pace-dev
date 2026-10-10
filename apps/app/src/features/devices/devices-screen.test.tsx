import { fireEvent, screen, within } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { DevicesScreen } from "./devices-screen.tsx";

const laptop = {
  connectedAt: Date.parse("2026-10-01T10:00:00.000Z"),
  id: "01LAPTOP",
  kind: "computer",
  lastActivityAt: "2026-10-06T11:55:00.000Z",
  lastSeenAt: Date.parse("2026-10-06T11:55:00.000Z"),
  name: "Linux Mint",
};

describe("Settings → Devices", () => {
  it("lists what sends usage with its last data, and disconnects a computer after asking", async () => {
    const devices = [laptop];
    const runtime = await createTestRuntime({
      routes: {
        "DELETE /api/devices/01LAPTOP": () => {
          devices.pop();
          return { ok: true };
        },
        "GET /api/devices": () => ({ devices }),
      },
    });
    await renderScreen(<DevicesScreen />, runtime);
    const row = await screen.findByLabelText("Linux Mint");
    expect(within(row).getByText(/^Computer · Last data 5m ago · Connected/u)).toBeOnTheScreen();
    await fireEvent.press(within(row).getByRole("button", { name: "Disconnect" }));
    expect(
      screen.getByText("Disconnect Linux Mint? Its token stops working at once."),
    ).toBeOnTheScreen();
    // Asked first: the confirm replaces the first button.
    await fireEvent.press(within(row).getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("Nothing sends app usage yet.")).toBeOnTheScreen();
  });

  it("adds a computer: a token inside one install command", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/devices": () => ({ devices: [] }),
        "POST /api/devices": ({ body }) => ({
          id: "01NEW",
          name: (body as { name: string }).name,
          token: "tok_secret",
        }),
      },
    });
    await renderScreen(<DevicesScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: "Add a computer" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Work laptop");
    await fireEvent.press(screen.getByRole("button", { name: "Create the token" }));
    expect(
      await screen.findByText(
        /python3 ~\/\.local\/share\/pace\/pace_aw_bridge\.py install .*--token tok_secret --device-id 01NEW --name 'Work laptop'/u,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send the command" })).toBeOnTheScreen();
  });
});
