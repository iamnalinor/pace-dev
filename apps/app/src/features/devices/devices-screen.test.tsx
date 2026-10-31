import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import { serverStore } from "#app/platform/server-store.ts";
import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeInstance } from "@pace/client/testing";

import { DevicesScreen } from "./devices-screen.tsx";

const laptop = {
  city: null,
  country: null,
  createdAt: Date.parse("2026-10-01T10:00:00.000Z"),
  current: false,
  id: "01LAPTOP",
  ip: null,
  kind: "agent",
  lastDataAt: "2026-10-06T11:55:00.000Z",
  lastSeenAt: Date.parse("2026-10-06T11:55:00.000Z"),
  name: "Linux Mint",
};

describe("Settings → Devices", () => {
  it("lists what sends usage with its last data, and disconnects a computer after asking", async () => {
    const sessions = [laptop];
    const runtime = await createTestRuntime({
      routes: {
        "DELETE /api/sessions/01LAPTOP": () => {
          sessions.pop();
          return { ok: true };
        },
        "GET /api/sessions": () => ({ sessions }),
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

  it("adds a computer: install commands omit the separately displayed token", async () => {
    // The commands name the current server's API and web app, as it reports them.
    const serverApi = "https://pace-api.example.dev";
    const serverWeb = "https://pace.example.dev";
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/instance": () => ({
          ...fakeInstance,
          apiOrigin: serverApi,
          webOrigin: serverWeb,
        }),
        "GET /api/sessions": () => ({ sessions: [] }),
        "POST /api/sessions/agents": ({ body }) => ({
          id: "01NEW",
          name: (body as { name: string }).name,
          token: "tok_secret",
        }),
      },
    });
    await renderScreen(<DevicesScreen />, runtime);
    await waitFor(() => {
      expect(serverStore.getState().instance?.apiOrigin).toBe(serverApi);
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Add a computer" }));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Work laptop");
    await fireEvent.press(screen.getByRole("button", { name: "Create the token" }));

    // Not on a computer here, so Windows comes first: PowerShell, Python if missing, the agent.
    const picker = await screen.findByLabelText("The computer's system");
    expect(within(picker).getByRole("radio", { name: "Windows" })).toBeChecked();
    expect(screen.getByText(/open PowerShell/u)).toBeOnTheScreen();
    const windowsLine = screen.getByText(/winget install -e --id Python\.Python\.3\.12/u);
    expect(windowsLine).toHaveTextContent(
      `Invoke-WebRequest -UseBasicParsing ${serverWeb}/pace_agent.py`,
      { exact: false },
    );
    expect(windowsLine).toHaveTextContent(`install --api ${serverApi} --name 'Work laptop'`, {
      exact: false,
    });
    expect(windowsLine).not.toHaveTextContent("tok_secret");
    expect(screen.getByText("tok_secret")).toBeOnTheScreen();
    expect(screen.getByText(/hidden prompt/u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send the token" })).toBeOnTheScreen();
    expect(
      screen.getByText(String.raw`py "$env:APPDATA\Pace\pace_agent.py" run --logs`),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/ActivityWatch/u)).toBeNull();

    // Linux: the packages first, then curl and python3.
    await fireEvent.press(within(picker).getByRole("radio", { name: "Linux" }));
    expect(within(picker).getByRole("radio", { name: "Linux" })).toBeChecked();
    expect(screen.getByText(/sudo apt install xdotool xprintidle/u)).toBeOnTheScreen();
    expect(screen.getByText(/GNOME on Wayland/u)).toBeOnTheScreen();
    expect(
      screen.getByText(
        `curl -fsSL ${serverWeb}/pace_agent.py -o ~/.pace_agent.py && python3 ~/.pace_agent.py install --api ${serverApi} --name 'Work laptop'`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/winget/u)).toBeNull();

    // macOS: the same line, in Terminal, without the Linux packages.
    await fireEvent.press(within(picker).getByRole("radio", { name: "macOS" }));
    expect(screen.getByText(/open Terminal/u)).toBeOnTheScreen();
    expect(screen.getByText(/^curl -fsSL .* install --api/u)).toBeOnTheScreen();
    expect(screen.queryByText(/xprintidle/u)).toBeNull();
    expect(screen.getByText("python3 ~/.pace_agent.py run --logs")).toBeOnTheScreen();
    expect(screen.getByText(/never window titles or URLs/u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send the command" })).toBeOnTheScreen();
  });
});
