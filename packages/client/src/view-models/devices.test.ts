import { describe, expect, it } from "vitest";

import { agentCommand, agentLogsCommand, computerOsOf } from "./devices.ts";

const setup = {
  apiBase: "https://api.pace.test",
  device: { name: "Mint's laptop", token: "tok_123" },
  webOrigin: "https://pace.test",
};

describe("the command that connects a computer", () => {
  it("on macOS and Linux downloads the agent with curl and installs it with python3", () => {
    const expected = String.raw`curl -fsSL https://pace.test/pace_agent.py -o ~/.pace_agent.py && python3 ~/.pace_agent.py install --token 'tok_123' --api https://api.pace.test --name 'Mint'\''s laptop'`;
    expect(agentCommand({ ...setup, os: "linux" })).toBe(expected);
    expect(agentCommand({ ...setup, os: "macos" })).toBe(expected);
  });

  it("on Windows finds or installs Python, then downloads the agent to AppData in PowerShell", () => {
    const command = agentCommand({ ...setup, os: "windows" });
    expect(command).toContain("winget install -e --id Python.Python.3.12");
    expect(command).toContain(
      String.raw`Invoke-WebRequest -UseBasicParsing https://pace.test/pace_agent.py -OutFile "$d\pace_agent.py"`,
    );
    expect(command).toContain(
      String.raw`& $py "$d\pace_agent.py" install --token 'tok_123' --api https://api.pace.test --name 'Mint''s laptop'`,
    );
    expect(command.startsWith(String.raw`$d="$env:APPDATA\Pace";`)).toBe(true);
    expect(command).not.toContain("\n");
  });

  it("keeps a name with typographic quotes inside PowerShell's single quotes", () => {
    // PowerShell ends a single-quoted string at ‘ ’ ‚ ‛ too; doubled, each stays literal.
    const command = agentCommand({
      ...setup,
      device: { name: "Ilya’s ‘big’ ‚PC‛ 'x'", token: "tok_123" },
      os: "windows",
    });
    expect(command).toContain("--name 'Ilya’’s ‘‘big’’ ‚‚PC‛‛ ''x'''");
  });

  it("drops double quotes from the name on Windows: PowerShell 5 would split the argument there", () => {
    const command = agentCommand({
      ...setup,
      device: { name: 'The "big" PC', token: "tok_123" },
      os: "windows",
    });
    expect(command).toContain("--name 'The big PC'");
  });

  it("shows how to watch what the agent sends on each system", () => {
    expect(agentLogsCommand("linux")).toBe("python3 ~/.pace_agent.py run --logs");
    expect(agentLogsCommand("macos")).toBe("python3 ~/.pace_agent.py run --logs");
    expect(agentLogsCommand("windows")).toBe(
      String.raw`py "$env:APPDATA\Pace\pace_agent.py" run --logs`,
    );
  });
});

describe("the computer's system from the browser", () => {
  it.each([
    ["Windows", "windows"],
    ["Win32", "windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "windows"],
    ["macOS", "macos"],
    ["MacIntel", "macos"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macos"],
    ["Linux", "linux"],
    ["Linux x86_64", "linux"],
    ["Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0)", "linux"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", null],
    ["Android", null],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", null],
    ["Darwin", "macos"],
    ["", null],
  ] as const)("%s → %s", (platform, os) => {
    expect(computerOsOf(platform)).toBe(os);
  });
});
