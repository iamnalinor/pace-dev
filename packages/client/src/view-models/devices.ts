/** The systems Pace's desktop agent runs on; each gets its own install steps. */
export type ComputerOs = "linux" | "macos" | "windows";

export const COMPUTER_OSES: readonly ComputerOs[] = ["windows", "macos", "linux"];

/** Where the agent lives once installed on macOS and Linux (Windows keeps it in AppData). */
const AGENT_PATH = "~/.pace_agent.py";

/** A single quote inside single quotes: close them, an escaped quote, open them again. */
const QUOTE_INSIDE = String.raw`'\''`;

/** A value for a POSIX shell, in single quotes. */
const shellQuote = (value: string): string => `'${value.split("'").join(QUOTE_INSIDE)}'`;

/**
A value for PowerShell, in single quotes. PowerShell ends such a string at the typographic
quotes ‘ ’ ‚ ‛ as well (a phone keyboard types ’ in "Ilya’s PC"), so each of the four is
doubled, which keeps it literal.
*/
const powerShellQuote = (value: string): string =>
  `'${value.replaceAll(/['‘’‚‛]/gu, (quote) => quote + quote)}'`;

/**
Windows PowerShell 5 passes an argument to a program without escaping a double quote inside,
which splits it there; the computer's name does without them.
*/
const withoutDoubleQuotes = (value: string): string => value.replaceAll('"', "");

/**
The PowerShell line for Windows. Python comes from `py` or `python`, tried by running them,
since a bare Windows has a `python` that only opens the Microsoft Store; without one, winget
installs it and the line reads the new PATH. TLS 1.2 is switched on for Windows PowerShell 5.
*/
const windowsCommand = (download: string, install: string): string =>
  [
    String.raw`$d="$env:APPDATA\Pace"`,
    "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072",
    "function Find-Py { foreach ($c in 'py','python') { if (Get-Command $c -ErrorAction SilentlyContinue) { & $c -c 'import sys' 2>$null; if ($LASTEXITCODE -eq 0) { return $c } } } }",
    "$py = Find-Py",
    "if (-not $py) { winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $py = Find-Py }",
    "if (-not $py) { throw 'Python is missing: install it from python.org, then paste this again.' }",
    "New-Item -ItemType Directory -Force $d | Out-Null",
    String.raw`Invoke-WebRequest -UseBasicParsing ${download} -OutFile "$d\pace_agent.py"`,
    String.raw`& $py "$d\pace_agent.py" ${install}`,
  ].join("; ");

/**
The one line that connects a computer: it downloads the agent from the web app and installs
it with the computer's token, which starts it with the computer (see docs/desktop.md).
*/
export const agentCommand = ({
  apiBase,
  device,
  os,
  webOrigin,
}: {
  readonly os: ComputerOs;
  readonly webOrigin: string;
  readonly apiBase: string;
  readonly device: { readonly name: string; readonly token: string };
}): string => {
  const download = `${webOrigin}/pace_agent.py`;
  if (os === "windows") {
    const install = `install --token ${powerShellQuote(device.token)} --api ${apiBase} --name ${powerShellQuote(withoutDoubleQuotes(device.name))}`;
    return windowsCommand(download, install);
  }
  const install = `install --token ${shellQuote(device.token)} --api ${apiBase} --name ${shellQuote(device.name)}`;
  return `curl -fsSL ${download} -o ${AGENT_PATH} && python3 ${AGENT_PATH} ${install}`;
};

/** The command that prints each sample and what the agent would send, sending nothing. */
export const agentLogsCommand = (os: ComputerOs): string =>
  os === "windows"
    ? String.raw`py "$env:APPDATA\Pace\pace_agent.py" run --logs`
    : `python3 ${AGENT_PATH} run --logs`;

/** The packages the agent needs on an X11 desktop, one line per family of distributions. */
export const LINUX_PACKAGES: readonly string[] = [
  "sudo apt install xdotool xprintidle",
  "sudo dnf install xdotool xprintidle",
  "sudo pacman -S xdotool xprintidle",
];

/**
The computer's system from what the browser says about its platform (`userAgentData.platform`,
`navigator.platform` or the user agent); null on a phone or a tablet, or when unsure.
*/
export const computerOsOf = (platform: string): ComputerOs | null => {
  const text = platform.toLowerCase();
  if (/android|iphone|ipad|ipod/u.test(text)) {
    return null;
  }
  // Before "win": "darwin" has it inside.
  if (/mac|darwin/u.test(text)) {
    return "macos";
  }
  if (text.includes("win")) {
    return "windows";
  }
  return /linux|x11/u.test(text) ? "linux" : null;
};
