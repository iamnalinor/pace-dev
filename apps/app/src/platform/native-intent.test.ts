import { mapSystemPath } from "./native-intent.ts";

describe("mapSystemPath", () => {
  it("maps App Links under /app to in-app routes", () => {
    expect(mapSystemPath("https://pace.nalinor.dev/app/settings")).toBe("/settings");
    expect(mapSystemPath("https://pace.nalinor.dev/app/auth?token=abc")).toBe("/auth?token=abc");
  });

  it("maps the bare /app link to the root", () => {
    expect(mapSystemPath("https://pace.nalinor.dev/app")).toBe("/");
    expect(mapSystemPath("https://pace.nalinor.dev/app/")).toBe("/");
  });

  it("sends share intents to the add screen", () => {
    expect(mapSystemPath("pace://dataUrl=pace%3A%2F%2Fshare")).toBe("/add");
  });

  it("keeps other paths untouched", () => {
    expect(mapSystemPath("/settings")).toBe("/settings");
    expect(mapSystemPath("pace://auth?token=abc")).toBe("pace://auth?token=abc");
  });
});
