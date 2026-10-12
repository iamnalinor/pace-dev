import { openTelegram } from "./open-telegram.web.ts";

describe("openTelegram in a browser", () => {
  it("opens t.me, which offers Telegram Web as well as the app", async () => {
    const browser = { canOpenURL: jest.fn(async () => true), openURL: jest.fn(async () => true) };
    await openTelegram("https://t.me/PaceTaskTrackerBot?start=weblogin_abc", browser);
    expect(browser.openURL.mock.calls).toEqual([
      ["https://t.me/PaceTaskTrackerBot?start=weblogin_abc"],
    ]);
  });
});
