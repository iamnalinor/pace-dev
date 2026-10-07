import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { freezeAt, seedArtboard } from "#web/test/artboard-world.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices } from "#web/test/services.ts";

import { SettingsLinks } from "./settings-links.tsx";

describe("SettingsLinks", () => {
  beforeEach(() => {
    freezeAt();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links to presets, the review block with its count, and history", async () => {
    const { services } = createTestServices();
    await seedArtboard(services);
    renderWithProviders(<SettingsLinks />, { services });
    expect(await screen.findByRole("link", { name: /Presets/ })).toHaveAttribute(
      "href",
      "/settings/presets",
    );
    expect(screen.getByRole("link", { name: /To sort/ })).toHaveAttribute("href", "/review");
    expect(screen.getByRole("link", { name: /To sort/ })).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute("href", "/history");
  });

  it("leaves the count out when nothing waits", async () => {
    renderWithProviders(<SettingsLinks />);
    expect(await screen.findByRole("link", { name: /To sort/ })).not.toHaveTextContent(/\d/);
  });
});
