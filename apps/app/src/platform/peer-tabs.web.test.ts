import type { StoreChange } from "@pace/client";

import { createPeerTabs } from "./peer-tabs.web.ts";

const CHANGE: StoreChange = { kind: "reload" };

/** A plain member of the channel, as another tab of the profile is. */
const otherTab = () => {
  const heard: unknown[] = [];
  const channel = new BroadcastChannel("pace.local-log");
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    heard.push(event.data);
  });
  return { channel, heard };
};

/** Lets the channel deliver what was posted. */
const delivered = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

describe("the tabs' line on the web (QA round 17 review m1, m2)", () => {
  it("tells the other tabs and hears them while the copy is shared, and nothing once closed", async () => {
    const other = otherTab();
    const peers = createPeerTabs(async () => true);
    const heard: unknown[] = [];
    peers?.listen((message) => {
      heard.push(message);
    });
    peers?.post(CHANGE);
    await delivered();
    other.channel.postMessage(CHANGE);
    await delivered();
    expect(other.heard).toEqual([CHANGE]);
    expect(heard).toEqual([CHANGE]);
    peers?.close();
    await delivered();
    other.channel.postMessage(CHANGE);
    peers?.post(CHANGE);
    await delivered();
    expect(heard).toHaveLength(1);
    expect(other.heard).toHaveLength(1);
    other.channel.close();
  });

  it("stays off the line while the copy lives in this page's memory (no IndexedDB)", async () => {
    const other = otherTab();
    const peers = createPeerTabs(async () => false);
    const heard: unknown[] = [];
    peers?.listen((message) => {
      heard.push(message);
    });
    peers?.post(CHANGE);
    other.channel.postMessage(CHANGE);
    await delivered();
    expect(other.heard).toEqual([]);
    expect(heard).toEqual([]);
    peers?.close();
    other.channel.close();
  });
});
