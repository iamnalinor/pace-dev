import { describe, expect, it } from "vitest";

import { type Health, nextHealth, orderByHealth, PENALTY_CAP_MS, penaltyMs } from "./health.ts";

const NOW = "2026-11-02T10:00:00.000Z";
const at = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

const providers = ["one", "two", "three"].map((name) => ({ name }));
const names = (list: readonly { readonly name: string }[]) => list.map((item) => item.name);

describe("penaltyMs", () => {
  it("starts at a minute and doubles with each failure in a row, up to half an hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((strikes) => penaltyMs(strikes) / 60_000)).toEqual([
      1, 2, 4, 8, 16, 30, 30, 30,
    ]);
    expect(PENALTY_CAP_MS).toBe(30 * 60_000);
  });
});

describe("orderByHealth", () => {
  it("moves a provider under penalty to the end, the others keep their places", () => {
    const health: Health = { one: { reason: "503", strikes: 1, until: at(1) } };
    const order = orderByHealth(providers, health, NOW);
    expect(names(order.ordered)).toEqual(["two", "three", "one"]);
    expect(order.probes.size).toBe(0);
  });

  it("keeps the configured order when every provider is under penalty", () => {
    const health: Health = {
      one: { reason: "503", strikes: 3, until: at(4) },
      three: { reason: "503", strikes: 1, until: at(1) },
      two: { reason: "timeout", strikes: 1, until: at(1) },
    };
    expect(names(orderByHealth(providers, health, NOW).ordered)).toEqual(["one", "two", "three"]);
  });

  it("puts a provider back in its place once its penalty is over, as a probe", () => {
    const health: Health = { one: { reason: "503", strikes: 2, until: at(-1) } };
    const order = orderByHealth(providers, health, NOW);
    expect(names(order.ordered)).toEqual(["one", "two", "three"]);
    expect([...order.probes]).toEqual(["one"]);
  });

  it("does not move a provider that was slow once", () => {
    const health: Health = { two: { reason: "slow", strikes: 1, until: null } };
    const order = orderByHealth(providers, health, NOW);
    expect(names(order.ordered)).toEqual(["one", "two", "three"]);
    expect(order.probes.size).toBe(0);
  });
});

describe("nextHealth", () => {
  it("penalizes a failure for a minute, doubling while the probes keep failing", () => {
    const first = nextHealth({}, [{ outcome: "unwell", provider: "one", why: "503" }], NOW);
    expect(first.health).toEqual({ one: { reason: "503", strikes: 1, until: at(1) } });
    expect(first.changes).toEqual([
      { kind: "moved-last", provider: "one", ...first.health["one"] },
    ]);
    const probed = nextHealth(
      first.health,
      [{ outcome: "unwell", provider: "one", why: "503" }],
      at(2),
    );
    expect(probed.health["one"]).toEqual({ reason: "503", strikes: 2, until: at(4) });
  });

  it("changes nothing for a failure while the penalty still runs", () => {
    const health: Health = { one: { reason: "503", strikes: 1, until: at(1) } };
    const next = nextHealth(health, [{ outcome: "unwell", provider: "one", why: "503" }], NOW);
    expect(next.changes).toEqual([]);
    expect(next.health).toBe(health);
  });

  it("clears a provider's record on its first success, and only then", () => {
    const health: Health = { one: { reason: "503", strikes: 4, until: at(-1) } };
    const next = nextHealth(health, [{ outcome: "ok", provider: "one", why: "" }], NOW);
    expect(next.health).toEqual({});
    expect(next.changes).toEqual([{ kind: "recovered", provider: "one" }]);
    expect(nextHealth({}, [{ outcome: "ok", provider: "one", why: "" }], NOW).changes).toEqual([]);
  });

  it("penalizes slowness only when it repeats", () => {
    const once = nextHealth({}, [{ outcome: "slow", provider: "two", why: "slow" }], NOW);
    expect(once.health).toEqual({ two: { reason: "slow", strikes: 1, until: null } });
    expect(once.changes).toEqual([{ kind: "noted", provider: "two" }]);
    const twice = nextHealth(once.health, [{ outcome: "slow", provider: "two", why: "slow" }], NOW);
    expect(twice.health["two"]).toEqual({ reason: "slow", strikes: 2, until: at(1) });
  });

  it("caps the penalty at half an hour however long the outage", () => {
    let health: Health = {};
    for (let probe = 0; probe < 12; probe += 1) {
      const now = health["one"]?.until ?? NOW;
      health = nextHealth(health, [{ outcome: "unwell", provider: "one", why: "503" }], now).health;
    }
    const entry = health["one"];
    expect(entry?.strikes).toBe(12);
    expect(Date.parse(entry?.until ?? "") - Date.parse(NOW)).toBeGreaterThan(0);
    const last = nextHealth(
      { one: { reason: "503", strikes: 12, until: NOW } },
      [{ outcome: "unwell", provider: "one", why: "503" }],
      NOW,
    );
    expect(last.health["one"]?.until).toBe(at(30));
  });
});
