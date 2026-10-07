import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { LanguageControl } from "./language-control.tsx";

describe("LanguageControl", () => {
  it("dispatches settings.updated and re-renders in the new language", async () => {
    const { services, user } = renderWithProviders(<LanguageControl />);
    expect(await screen.findByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Русский" }));
    expect(await screen.findByRole("radiogroup", { name: "Язык" })).toBeInTheDocument();
    expect(services.state.store.getState().settings.language).toBe("ru");
    expect(services.state.store.getState().events.at(-1)?.type).toBe("settings.updated");
  });
});
