# App usage from a computer

Pace shows where the time of each block went ("where I sat"): the apps in front on every device
during it. The phone sends its own; a computer runs Pace's own agent,
`tools/pace-agent/pace_agent.py`: one Python file (3.9 or newer, standard library only) for
Windows, macOS and Linux. Nothing else to install: no tracker app, no browser extension.

## What it collects

Every 5 seconds it asks the system two things: the **name of the application in front** and
**how long ago the last key press or mouse move was**. That is all. Never window titles, URLs,
document names, keystrokes or screenshots.

- A sample counts while someone is at the computer: the last input under 60 s ago. When it is
  older, the session ends at that last input.
- Samples of the same app join into a session; a gap under a minute (a busy or briefly sleeping
  computer) joins too. Sessions under a minute are dropped (a glance while switching).
- Every 5 minutes it sends the finished sessions and the running one (cut at its last sample) to
  `POST /api/usage/sessions` with the computer's token. The server keeps one row per device, app
  and start and takes the later end, so the running session grows with each send.
- Offline, sessions wait in `buffer.json` next to the settings and go with the next send; after
  a failure it waits 5, 10, 20, 40, then 60 minutes between tries. Sessions older than a week
  are dropped. A finished session is written to the buffer at once (whole, then renamed into
  place); a damaged buffer is kept as `buffer.json.bad` and the agent starts afresh.

Nothing is judged: Pace only shows where the time went.

## Connect a computer

**Settings → Devices → Add a computer**. Give it a name and press *Create the token*. Pick the
computer's system (the web app preselects the one it runs on) and follow its steps.

The token is shown once and may only upload usage (`usage:write`): it cannot read or change
anything else, and whatever it sends is filed under its own computer. Paste the install command
first; when the agent prompts for the token, copy it separately from Pace and paste it there.
The prompt hides it and the install command contains no token, so it stays out of terminal
history and process arguments. The agent saves it in `config.json` with private file permissions;
*Disconnect* in Settings → Devices revokes it at once. Lost it? Disconnect the computer and add it again.

### Windows

Open PowerShell (Start → "PowerShell") and paste the line Pace shows. It:

1. looks for Python (`py`, then `python`, each run once: a bare Windows has a `python` that only
   opens the Microsoft Store), and without one installs it:
   `winget install -e --id Python.Python.3.12` (winget may ask to allow it);
2. downloads `pace_agent.py` from the web app to `%APPDATA%\Pace`;
3. runs `pace_agent.py install --api … --name …`, prompts for the token without echo, saves the settings to
   `%APPDATA%\Pace\config.json` and registers the Task Scheduler task **Pace agent**: at logon,
   without elevation (`LeastPrivilege`), running `pythonw.exe pace_agent.py run` (no window), then
   starts it.

The task is created from an XML file (`pace-agent-task.xml`) rather than `schtasks /SC ONLOGON`,
because a task made that way does not start on battery and is stopped after three days. If
Task Scheduler refuses (some managed computers), the agent starts from the `Run` key of the
account (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) instead.

Probes: `GetForegroundWindow` → `GetWindowThreadProcessId` → `QueryFullProcessImageNameW`; the
name is the program's *FileDescription* ("Firefox", "Visual Studio Code"), else the `.exe` name.
Idle time: `GetLastInputInfo` against `GetTickCount64`.

### macOS

Open Terminal (⌘ Space → "Terminal") and paste:

```sh
curl -fsSL https://<web app>/pace_agent.py -o ~/.pace_agent.py && python3 ~/.pace_agent.py install --api https://<api> --name '…'
```

`python3` comes with the Command Line Tools: on a fresh Mac the first `python3` offers to
install them; agree, then paste the line again. `install` saves the settings to
`~/Library/Application Support/Pace/config.json` and loads the LaunchAgent
`~/Library/LaunchAgents/app.pace.agent.plist` (`RunAtLoad`, `KeepAlive`, its output in
`agent.log` next to the settings) with `launchctl bootstrap gui/$UID`.

Probes: `lsappinfo info -only name $(lsappinfo front)` for the app in front and
`ioreg -c IOHIDSystem` (`HIDIdleTime`) for idle time. Neither needs the Accessibility or Screen
Recording permission.

### Linux

On an X11 (Xorg) desktop — Linux Mint, Ubuntu on Xorg, Xfce, MATE, KDE on X11 — install the two
small tools first:

```sh
sudo apt install xdotool xprintidle     # Debian, Ubuntu, Mint
sudo dnf install xdotool xprintidle     # Fedora
sudo pacman -S xdotool xprintidle       # Arch
```

Then paste the same `curl … && python3 ~/.pace_agent.py install …` line as on macOS. `install`
saves the settings to `~/.config/pace/config.json` (with the session's `DISPLAY`, since a user
service may start before the desktop), writes the systemd user service
`~/.config/systemd/user/pace-agent.service`, enables and starts it. The X cookie (`XAUTHORITY`)
is not saved: some display managers put it in a new temporary file at each login. The agent reads
it from the user manager (`systemctl --user show-environment`) at start and whenever `xdotool`
fails; most desktops hand it over on login, and on one that does not, add
`systemctl --user import-environment DISPLAY XAUTHORITY` to the desktop's autostart.

Probes: `xdotool getactivewindow getwindowpid` → `/proc/<pid>/comm`, or the window's `WM_CLASS`
(`xprop`) when the window does not say its process; idle time from `xprintidle`.

**Wayland.** KDE Plasma on Wayland works with [kdotool](https://github.com/jinliu/kdotool)
installed (`kdotool getactivewindow getwindowpid`; idle time from
`org.freedesktop.ScreenSaver.GetSessionIdleTime` over D-Bus). **GNOME on Wayland is not
supported**: it does not let other programs see which window is in front. `install` says
"Unsupported desktop (GNOME on Wayland)" and stops; choose "GNOME on Xorg" at the login screen
(the gear under the password field) and run it again.

## Commands

```sh
python3 ~/.pace_agent.py run --logs   # each sample and what it would send; sends nothing (Ctrl+C stops)
python3 ~/.pace_agent.py status       # the settings, the last send, what waits to be sent, the last error
python3 ~/.pace_agent.py run          # what the autostart runs
python3 ~/.pace_agent.py uninstall    # remove the autostart and the settings
```

On Windows: `py "$env:APPDATA\Pace\pace_agent.py" …` (or `python` for the Microsoft Store's
Python). `install` prints the exact `run --logs` line for its own Python.

`run --logs` shows a line per sample (`10:41:05  firefox, idle 2 s: active since 10:39:50`) and,
every 5 minutes and on Ctrl+C, the JSON body it would send. It keeps nothing and does not touch
the running agent's buffer, so it is safe next to it. A second plain `run` exits at once
("Already running"): it would send every session twice.

`uninstall` removes the task, LaunchAgent or service, and `config.json`, `buffer.json` and
`agent.log`; disconnect the computer in **Settings → Devices** too, which revokes its token.

## Troubleshooting

- **Nothing in Settings → Devices after 5 minutes.** `status` shows the last send and the last
  error. "HTTP Error 401" means the token was revoked: disconnect the computer and add it again.
- **Linux: "Missing xdotool, xprintidle".** Install them (above) and run `install` again.
- **Linux: "No graphical session here".** Run `install` from a terminal on the desktop, not over
  SSH: it records the display the service uses.
- **Linux: every sample says `xdotool: … Can't open display` or `Authorization required`.** The
  service lacks the desktop's X cookie: run
  `systemctl --user import-environment DISPLAY XAUTHORITY` in a terminal on the desktop (add it to
  the desktop's autostart to keep it). `systemctl --user status pace-agent` and
  `journalctl --user -u pace-agent` show the service's output.
- **Linux: "Unsupported desktop (GNOME on Wayland)".** See Wayland above.
- **macOS:** `launchctl print gui/$UID/app.pace.agent` and `agent.log` in
  `~/Library/Application Support/Pace`.
- **Windows:** Task Scheduler → *Pace agent* → History; `status` shows the last error.
- **An app shows under an odd name** (`python3`, `java`): that is the program's own name, the
  only thing the agent reads. Pace shows it as sent.

## Tests

`python3 -m unittest discover -s tools/pace-agent` (part of `bun test:unit`): sessions joining,
the idle cut, short sessions dropped, the buffer on a failed send and its flush, the body,
`--logs`, the settings folder per system, and the generated LaunchAgent, systemd unit and Task
Scheduler task. The probes are stubbed; the time is passed in.
