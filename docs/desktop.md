# App usage from a computer

Pace shows where the time of each block went ("where I sat"): the apps in front on every device
during it. The phone sends its own; a computer sends through
[ActivityWatch](https://activitywatch.net) and a small bridge,
`tools/pace-aw-bridge/pace_aw_bridge.py` (Python 3, standard library only).

Only **app names and times** leave the computer: never window titles, URLs or contents. The time
counts only while someone is at the computer (ActivityWatch's AFK watcher). Nothing is judged:
Pace only shows where the time went.

## Connect a computer

1. **Settings → Devices → Add a computer**. Give it a name and press *Create the token*.
2. Install ActivityWatch on that computer and start it; turn on *Start on login* in its tray
   menu. On Linux Mint, Ubuntu or any X11 desktop the bundled watchers work as they are. On
   Wayland (GNOME, KDE) use [awatcher](https://github.com/2e3s/awatcher) instead of
   `aw-watcher-window`.
3. Paste the command Pace shows into a terminal there. It:
   - downloads the bridge to `~/.local/share/pace/pace_aw_bridge.py` (served by the web app);
   - saves the server, the device's token and id to `~/.config/pace/aw-bridge.json` (mode 600);
   - writes a systemd user service and timer (`~/.config/systemd/user/pace-aw-bridge.*`) that
     sends every 5 minutes, enables it, and sends once.
4. The computer appears in **Settings → Devices** with its last data within 5 minutes.

The token is shown once and may only upload usage (`usage:write`): it cannot read or change
anything else. Lost it? Disconnect the computer and add it again.

### macOS and Windows

Run the same `python3 … install …` command. Without systemd it saves the settings and sends
once; schedule `python3 ~/.local/share/pace/pace_aw_bridge.py run` every 5 minutes yourself
(launchd on macOS, Task Scheduler on Windows).

## Commands

```sh
python3 pace_aw_bridge.py run --dry-run   # print what would be sent, send nothing
python3 pace_aw_bridge.py run             # send what ActivityWatch recorded since the last run
python3 pace_aw_bridge.py uninstall       # stop the timer, forget the settings
systemctl --user status pace-aw-bridge.timer
journalctl --user -u pace-aw-bridge       # the runs' output
```

`PACE_AW_URL` points the bridge at another ActivityWatch server (default
`http://localhost:5600`); `PACE_AW_CONFIG` at another settings file.

## How it works

- Each run reads the window and AFK buckets of this host from ActivityWatch's REST API, from the
  last run's cursor (a day back the first time) to now.
- Window events are cut to the stretches someone was active; pieces of the same app less than a
  minute apart are joined; sessions under a minute are dropped.
- `POST /api/usage/sessions` stores one row per device, app and start, keeping the later end, so
  the last session (maybe still open) is sent again next time, grown.
- The phone sends the same way from the app (on start and on return), named after the phone.

## Tests

`python3 -m unittest discover -s tools/pace-aw-bridge` (part of `bun test:unit`).
