import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { serverStore } from "#app/platform/server-store.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { fakeInstance } from "@pace/client/testing";

import { useServerProblem } from "./configuration-notice.tsx";

/** The frame as the root layout composes it: the server's problem handed in. */
const App = () => (
  <SyncFrame isBare={false} serverProblem={useServerProblem()}>
    <Text>{en("now.empty")}</Text>
  </SyncFrame>
);

const misconfigured = () =>
  Response.json(
    {
      code: "server/misconfigured",
      message: "Server configuration is invalid",
      reason: "project-mismatch",
    },
    { status: 500 },
  );

afterEach(async () => {
  await act(async () => {
    serverStore.setState({ configurationError: null });
  });
});

it("keeps the local screen and session while the strip says the configuration reason", async () => {
  const runtime = await createTestRuntime({ routes: { "GET /api/instance": misconfigured } });
  await runtime.auth.me();
  await renderScreen(<App />, runtime);
  expect(
    await screen.findByText(
      "The server's Firebase settings name different projects. Ask its owner to correct them.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText(en("now.empty"))).toBeOnTheScreen();
  expect(runtime.auth.store.getState().status).toBe("signed-in");
  expect(screen.queryByText(en("server.mismatch"))).toBeNull();
});

it("asks the server again from the strip's Retry and clears once it answers", async () => {
  const network = { broken: true };
  const runtime = await createTestRuntime({
    routes: { "GET /api/instance": () => (network.broken ? misconfigured() : fakeInstance) },
  });
  await runtime.auth.me();
  await renderScreen(<App />, runtime);
  const line = en("server.firebaseProjectMismatch");
  expect(await screen.findByText(line)).toBeOnTheScreen();
  network.broken = false;
  await fireEvent.press(screen.getByRole("button", { name: en("sync.retry") }));
  await waitFor(() => {
    expect(screen.queryByText(line)).toBeNull();
  });
});
