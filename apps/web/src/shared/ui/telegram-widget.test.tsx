import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TelegramWidget } from "./telegram-widget.tsx";

describe("TelegramWidget", () => {
  it("gives the iframe the widget script injects an accessible name", async () => {
    const { container } = render(
      <TelegramWidget botUsername="TestBot" label="Continue with Telegram" onAuth={() => {}} />,
    );
    const host = container.querySelector("div");
    if (host === null) {
      throw new Error("widget host not rendered");
    }

    // The real script (not loaded in jsdom) replaces itself with an untitled iframe.
    const iframe = document.createElement("iframe");
    iframe.id = "telegram-login-TestBot";
    host.append(iframe);

    await waitFor(() => {
      expect(iframe.title).toBe("Continue with Telegram");
    });
  });

  it("mounts the official widget script with the bot username", () => {
    const { container } = render(
      <TelegramWidget botUsername="TestBot" label="Continue with Telegram" onAuth={() => {}} />,
    );
    const script = container.querySelector("script");
    expect(script?.dataset["telegramLogin"]).toBe("TestBot");
    expect(script?.src).toContain("telegram.org/js/telegram-widget.js");
  });
});
