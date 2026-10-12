import { appIntent, isAndroidBrowser } from "./app-intent.ts";

describe("appIntent", () => {
  it("opens this site's App Link in the app, and the site itself when the app is not there", () => {
    expect(appIntent("https://pace.nalinor.dev")).toBe(
      "intent://pace.nalinor.dev/app/login#Intent;scheme=https;package=dev.nalinor.pace;" +
        "S.browser_fallback_url=https%3A%2F%2Fpace.nalinor.dev%2F;end",
    );
  });
});

describe("isAndroidBrowser", () => {
  it("tells an Android browser (Telegram's in-app one included) from a computer", () => {
    expect(
      isAndroidBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Telegram-Android/11",
      ),
    ).toBe(true);
    expect(isAndroidBrowser("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141")).toBe(
      false,
    );
  });
});
