import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SLOW_AFTER_MS, TelegramWidget } from "./telegram-widget.tsx";

const TEXTS = {
  failed: "Could not load the Telegram button.",
  loading: "Loading the Telegram button…",
  slow: "Telegram is slow to answer.",
};

const renderWidget = () =>
  render(
    <TelegramWidget
      botUsername="TestBot"
      label="Continue with Telegram"
      onAuth={vi.fn()}
      texts={TEXTS}
    />,
  );

/** The real script (not loaded in jsdom) replaces itself with an untitled iframe. */
const injectFrame = (): HTMLIFrameElement => {
  const iframe = document.createElement("iframe");
  iframe.id = "telegram-login-TestBot";
  screen.getByTestId("telegram-widget").append(iframe);
  return iframe;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("TelegramWidget", () => {
  it("shows a loading row until the button exists, then names the iframe", async () => {
    renderWidget();
    expect(screen.getByRole("status")).toHaveTextContent(TEXTS.loading);

    const iframe = injectFrame();

    expect(await screen.findByTitle("Continue with Telegram")).toBe(iframe);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so when telegram.org is slow, and stops once the button arrives", async () => {
    vi.useFakeTimers();
    renderWidget();

    act(() => {
      vi.advanceTimersByTime(SLOW_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(TEXTS.slow);

    injectFrame();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports a script that failed to load", () => {
    renderWidget();
    act(() => {
      screen.getByTestId("telegram-widget-script").dispatchEvent(new Event("error"));
    });

    expect(screen.getByRole("status")).toHaveTextContent(TEXTS.failed);
  });
});

describe("TelegramWidget redirect mode", () => {
  it("asks Telegram to redirect back through /auth/telegram instead of evaluating a callback", () => {
    renderWidget();
    const script = screen.getByTestId("telegram-widget-script");
    expect(script).not.toHaveAttribute("data-onauth");
    expect(script.dataset["authUrl"]).toContain("/auth/telegram?return=");
  });

  it("finishes a login the return page stored", () => {
    sessionStorage.setItem(
      "pace.telegram-login",
      JSON.stringify({ auth_date: 1, first_name: "A", hash: "h", id: 7 }),
    );
    const onAuth = vi.fn();
    render(
      <TelegramWidget
        botUsername="TestBot"
        label="Continue with Telegram"
        onAuth={onAuth}
        texts={TEXTS}
      />,
    );
    expect(onAuth).toHaveBeenCalledWith({ auth_date: 1, first_name: "A", hash: "h", id: 7 });
  });
});
