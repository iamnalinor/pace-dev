import { act, screen } from "@testing-library/react-native";

import { focusField } from "#app/platform/focus-field.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { FAKE_STORE_ID, fakeUser } from "@pace/client/testing";

import { NowScreen } from "./now-screen.tsx";

jest.mock("#app/platform/focus-field.ts", () => ({ focusField: jest.fn() }));

const EMPTY_PAGE = { events: [], more: false, seq: 0, storeId: FAKE_STORE_ID };

describe("a direct load of /add (QA21 M2, R23-12)", () => {
  it("puts the cursor in the New task form's title once a fresh browser's first-sync cover lifts, not before", async () => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/sync/pull": async () => await promise,
        "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
      },
      world: "empty",
    });
    await runtime.auth.loginWithDev("1");
    await renderScreen(
      <SyncFrame isBare={false}>
        <NowScreen opensForm />
      </SyncFrame>,
      runtime,
    );
    // Under the cover a field takes no focus: asking for it would be lost.
    expect(focusField).not.toHaveBeenCalled();
    await act(async () => {
      resolve(EMPTY_PAGE);
      await Promise.resolve();
    });
    expect(await screen.findByLabelText(en("edit.taskTitle"))).toBeOnTheScreen();
    expect(focusField).toHaveBeenCalled();
  });
});
