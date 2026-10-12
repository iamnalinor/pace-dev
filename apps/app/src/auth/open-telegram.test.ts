import { openTelegram, telegramAppLink } from "./open-telegram.ts";

const WEB = "https://t.me/PaceTaskTrackerBot?start=login_abc";
const APP = "tg://resolve?domain=PaceTaskTrackerBot&start=login_abc";

const linking = (canOpenApp: boolean, didAppOpen = true) => ({
  canOpenURL: jest.fn(async (url: string) => canOpenApp && url.startsWith("tg:")),
  openURL: jest.fn(async (url: string) => {
    if (!didAppOpen && url.startsWith("tg:")) {
      throw new Error("no activity");
    }
    return true;
  }),
});

describe("telegramAppLink", () => {
  it("turns the bot's t.me link into Telegram's own scheme", () => {
    expect(telegramAppLink(WEB)).toBe(APP);
  });

  it("leaves anything else alone", () => {
    expect(telegramAppLink("https://example.com/?start=x")).toBeUndefined();
    expect(telegramAppLink("not a url")).toBeUndefined();
  });
});

describe("openTelegram", () => {
  it("opens the Telegram app straight away when tg:// leads somewhere", async () => {
    const phone = linking(true);
    await openTelegram(WEB, phone);
    expect(phone.openURL.mock.calls).toEqual([[APP]]);
  });

  it("goes through t.me when no app takes tg://", async () => {
    const phone = linking(false);
    await openTelegram(WEB, phone);
    expect(phone.openURL.mock.calls).toEqual([[WEB]]);
  });

  it("falls back to t.me when the app was there but did not open", async () => {
    const phone = linking(true, false);
    await openTelegram(WEB, phone);
    expect(phone.openURL.mock.calls).toEqual([[APP], [WEB]]);
  });
});
