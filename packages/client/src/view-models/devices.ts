/** Where the desktop bridge lives on the computer once installed. */
const BRIDGE_PATH = "~/.local/share/pace/pace_aw_bridge.py";

/** A single quote inside single quotes: close them, an escaped quote, open them again. */
const QUOTE_INSIDE = String.raw`'\''`;

/** A value for a POSIX shell, in single quotes. */
const shellQuote = (value: string): string => `'${value.split("'").join(QUOTE_INSIDE)}'`;

/**
The one command that connects a computer: it downloads the bridge from the web app, saves the
server and the device's token, and has systemd run it every five minutes (see docs/desktop.md).
*/
export const bridgeCommand = ({
  apiBase,
  device,
  webOrigin,
}: {
  readonly webOrigin: string;
  readonly apiBase: string;
  readonly device: { readonly id: string; readonly name: string; readonly token: string };
}): string =>
  [
    "mkdir -p ~/.local/share/pace",
    `curl -fsSL ${webOrigin}/pace_aw_bridge.py -o ${BRIDGE_PATH}`,
    [
      `python3 ${BRIDGE_PATH} install`,
      `--server ${apiBase}`,
      `--token ${device.token}`,
      `--device-id ${device.id}`,
      `--name ${shellQuote(device.name)}`,
    ].join(" "),
  ].join(" && ");
