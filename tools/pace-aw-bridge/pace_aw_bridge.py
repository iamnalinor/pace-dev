#!/usr/bin/env python3
"""Pace desktop bridge: app usage from ActivityWatch, uploaded to Pace.

Reads the window and AFK watchers of the local ActivityWatch server, keeps only the
application name and the time it was in front while you were at the computer (never window
titles), joins the pieces into sessions and sends them to Pace. Runs once per call; a
systemd user timer calls it every few minutes (see docs/desktop.md).

    pace_aw_bridge.py install --server URL --token TOKEN --device-id ID [--name NAME]
    pace_aw_bridge.py run [--dry-run]
    pace_aw_bridge.py uninstall

`install` saves the settings, sets up a systemd user timer that runs it every 5 minutes, and
sends once. Settings → Devices → Add a computer in Pace shows the whole command.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

AW_URL = os.environ.get("PACE_AW_URL", "http://localhost:5600")
CONFIG_PATH = Path(
    os.environ.get("PACE_AW_CONFIG", Path.home() / ".config" / "pace" / "aw-bridge.json")
)

# Pieces of the same app this close together are one session.
JOIN_GAP = timedelta(seconds=60)
# Shorter sessions are noise (a glance while switching).
MIN_SESSION = timedelta(seconds=60)
# A first run looks this far back.
FIRST_LOOKBACK = timedelta(hours=24)
# At most this many sessions go in one request.
BATCH = 500
# Without a session to resend, the next run still reads this far back.
REREAD = timedelta(minutes=10)


@dataclass(frozen=True)
class Span:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class Session:
    app: str
    start: datetime
    end: datetime


def parse_time(text: str) -> datetime:
    """An ActivityWatch timestamp (ISO 8601, maybe with a Z) as an aware UTC datetime."""
    value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    """UTC with milliseconds and a Z, as the Pace API reads instants."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + (
        f"{value.microsecond // 1000:03d}Z"
    )


def event_span(event: dict) -> Span:
    start = parse_time(event["timestamp"])
    return Span(start, start + timedelta(seconds=float(event.get("duration", 0))))


def active_spans(afk_events: list[dict]) -> list[Span]:
    """The stretches the AFK watcher says someone was at the computer, merged and in order."""
    spans = sorted(
        (event_span(event) for event in afk_events if event.get("data", {}).get("status") == "not-afk"),
        key=lambda span: span.start,
    )
    merged: list[Span] = []
    for span in spans:
        if merged and span.start <= merged[-1].end:
            merged[-1] = Span(merged[-1].start, max(merged[-1].end, span.end))
        else:
            merged.append(span)
    return merged


def clip(span: Span, active: list[Span]) -> list[Span]:
    """The parts of `span` inside the active stretches."""
    parts = []
    for window in active:
        start, end = max(span.start, window.start), min(span.end, window.end)
        if end > start:
            parts.append(Span(start, end))
    return parts


def sessions_from(window_events: list[dict], afk_events: list[dict]) -> list[Session]:
    """App sessions while active: same-app pieces joined across short gaps, short ones dropped."""
    active = active_spans(afk_events)
    pieces = sorted(
        (
            Session(app, part.start, part.end)
            for event in window_events
            if (app := str(event.get("data", {}).get("app", "")).strip())
            for part in clip(event_span(event), active)
        ),
        key=lambda session: session.start,
    )
    joined: list[Session] = []
    for piece in pieces:
        last = joined[-1] if joined else None
        if last is not None and last.app == piece.app and piece.start - last.end <= JOIN_GAP:
            joined[-1] = Session(last.app, last.start, max(last.end, piece.end))
        else:
            joined.append(piece)
    return [session for session in joined if session.end - session.start >= MIN_SESSION]


def request_json(url: str, *, data: dict | None = None, token: str | None = None):
    body = None if data is None else json.dumps(data).encode()
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b"null")


def bucket_events(bucket: str, start: datetime, end: datetime) -> list[dict]:
    query = urllib.parse.urlencode({"start": iso(start), "end": iso(end)})
    return request_json(f"{AW_URL}/api/0/buckets/{urllib.parse.quote(bucket)}/events?{query}")


def find_bucket(buckets: dict, kind: str) -> str | None:
    """The watcher's bucket on this host (`aw-watcher-window_<host>`), else any of that kind."""
    own = f"{kind}_{socket.gethostname()}"
    if own in buckets:
        return own
    return next((name for name in sorted(buckets) if name.startswith(f"{kind}_")), None)


def load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text())
    except FileNotFoundError:
        return {}


def save_config(config: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    CONFIG_PATH.chmod(0o600)


def payload_of(config: dict, sessions: list[Session]) -> dict:
    return {
        "deviceId": config["deviceId"],
        "deviceName": config["deviceName"],
        "sessions": [
            {"app": s.app[:120], "endAt": iso(s.end), "startAt": iso(s.start)} for s in sessions
        ],
    }


def run(dry_run: bool) -> int:
    config = load_config()
    if "server" not in config or "token" not in config:
        print("Not set up: run `pace_aw_bridge.py setup --server URL --token TOKEN` first.", file=sys.stderr)
        return 2
    now = datetime.now(timezone.utc)
    since = parse_time(config["cursor"]) if "cursor" in config else now - FIRST_LOOKBACK
    buckets = request_json(f"{AW_URL}/api/0/buckets/")
    window, afk = find_bucket(buckets, "aw-watcher-window"), find_bucket(buckets, "aw-watcher-afk")
    if window is None or afk is None:
        print("ActivityWatch has no window or AFK watcher running.", file=sys.stderr)
        return 3
    sessions = sessions_from(bucket_events(window, since, now), bucket_events(afk, since, now))
    if dry_run:
        print(json.dumps(payload_of(config, sessions), indent=2, ensure_ascii=False))
        return 0
    for index in range(0, len(sessions), BATCH):
        request_json(
            f"{config['server'].rstrip('/')}/api/usage/sessions",
            data=payload_of(config, sessions[index : index + BATCH]),
            token=config["token"],
        )
    # The last session may still grow: the next run starts from its start and sends it again
    # (the server keeps one row per device, app and start).
    # With none, start a little back, so an app opened just now is not cut at its start.
    config["cursor"] = iso(sessions[-1].start if sessions else max(since, now - REREAD))
    save_config(config)
    print(f"Sent {len(sessions)} sessions.")
    return 0


def setup(server: str, token: str, *, device_id: str | None, name: str | None) -> int:
    config = load_config()
    config.update(
        {
            "deviceId": device_id or config.get("deviceId", str(uuid.uuid4())),
            "deviceName": name or socket.gethostname(),
            "server": server,
            "token": token,
        }
    )
    save_config(config)
    print(f"Saved to {CONFIG_PATH}.")
    return 0


UNIT_DIR = Path.home() / ".config" / "systemd" / "user"
UNIT = "pace-aw-bridge"


def units(script: Path) -> dict[str, str]:
    """The systemd user service (one run) and the timer that starts it every 5 minutes."""
    return {
        f"{UNIT}.service": (
            "[Unit]\nDescription=Pace: send app usage from ActivityWatch\n\n"
            f'[Service]\nType=oneshot\nExecStart="{sys.executable}" "{script}" run\n'
        ),
        f"{UNIT}.timer": (
            "[Unit]\nDescription=Pace: send app usage every 5 minutes\n\n"
            "[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nPersistent=true\n\n"
            "[Install]\nWantedBy=timers.target\n"
        ),
    }


def install(args: argparse.Namespace) -> int:
    setup(args.server, args.token, device_id=args.device_id, name=args.name)
    if shutil.which("systemctl") is None:
        print("No systemd here: run `pace_aw_bridge.py run` every few minutes (cron, Task Scheduler).")
        return run(dry_run=False)
    UNIT_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in units(Path(__file__).resolve()).items():
        (UNIT_DIR / name).write_text(text)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", f"{UNIT}.timer"], check=True)
    print("Installed: Pace hears from this computer every 5 minutes.")
    return run(dry_run=False)


def uninstall() -> int:
    if shutil.which("systemctl") is not None:
        subprocess.run(["systemctl", "--user", "disable", "--now", f"{UNIT}.timer"], check=False)
    for name in units(Path(__file__).resolve()):
        (UNIT_DIR / name).unlink(missing_ok=True)
    CONFIG_PATH.unlink(missing_ok=True)
    print("Removed. Revoke the device in Pace → Settings → Devices too.")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    for command, about in (
        ("install", "save the settings, run every 5 minutes (systemd), send once"),
        ("setup", "only save the server and the device token"),
    ):
        sub = commands.add_parser(command, help=about)
        sub.add_argument("--server", required=True)
        sub.add_argument("--token", required=True)
        sub.add_argument("--device-id", help="the device's id in Pace (shown with the token)")
        sub.add_argument("--name", help="how this computer is shown (default: its hostname)")
    commands.add_parser("uninstall", help="stop sending and forget the settings")
    once = commands.add_parser("run", help="send what ActivityWatch recorded since the last run")
    once.add_argument("--dry-run", action="store_true", help="print the sessions, send nothing")
    args = parser.parse_args(argv)
    try:
        if args.command == "install":
            return install(args)
        if args.command == "setup":
            return setup(args.server, args.token, device_id=args.device_id, name=args.name)
        if args.command == "uninstall":
            return uninstall()
        return run(args.dry_run)
    except urllib.error.URLError as error:
        print(f"Cannot reach {getattr(error, 'url', '') or 'a server'}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
