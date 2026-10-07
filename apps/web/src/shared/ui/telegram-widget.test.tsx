import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TelegramWidget } from "./telegram-widget.tsx";

describe("TelegramWidget", () => {
  it("gives the iframe the widget script injects an accessible name", async () => {
    render(
      <TelegramWidget botUsername="TestBot" label="Continue with Telegram" onAuth={vi.fn()} />,
    );

    // The real script (not loaded in jsdom) replaces itself with an untitled iframe.
    const iframe = document.createElement("iframe");
    iframe.id = "telegram-login-TestBot";
    screen.getByTestId("telegram-widget").append(iframe);

    expect(await screen.findByTitle("Continue with Telegram")).toBe(iframe);
  });
});
