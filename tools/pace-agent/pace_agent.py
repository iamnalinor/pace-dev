#!/usr/bin/env python3
"""Pace agent: which app is in front on this computer, sent to Pace every 5 minutes.

Every 5 seconds it asks the system which application is in front and how long ago the last
key press or mouse move was. Only the application's name and the times leave the computer:
never window titles, URLs or what is in them. Python 3.9+, standard library only; Windows,
macOS and Linux (X11, or KDE on Wayland with kdotool).

    pace_agent.py install --token TOKEN --api URL [--name NAME]
    pace_agent.py run [--logs]
    pace_agent.py status
    pace_agent.py uninstall

`install` saves the settings and starts the agent with the computer (Task Scheduler, a
LaunchAgent, a systemd user service). `run --logs` prints each sample and what it would send,
and sends nothing. Settings → Devices → Add a computer in Pace shows the whole command; see
docs/desktop.md.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import platform
import plistlib
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PureWindowsPath
from typing import IO, Callable, Mapping, Optional
from xml.sax.saxutils import escape

SYSTEM = platform.system()

# How often it looks at the screen.
SAMPLE_EVERY_SECONDS = 5
# Without a key press or mouse move for this long, nobody is at the computer.
IDLE_AFTER_SECONDS = 60
# Samples of the same app this close together are one session.
JOIN_GAP_SECONDS = 60
# Shorter sessions are noise (a glance while switching).
MIN_SESSION_SECONDS = 60
# How often it sends; after a failed send it waits twice as long each time, up to an hour.
SEND_EVERY_SECONDS = 300
MAX_BACKOFF_SECONDS = 3600
# Unsent sessions older than this are dropped (the computer was offline for a week).
KEEP_SECONDS = 7 * 24 * 3600
# At most this many sessions go in one request (the server takes up to 1000).
BATCH = 500
# The server keeps app names up to this length.
APP_NAME_MAX = 120

TASK_NAME = "Pace agent"
LAUNCH_LABEL = "app.pace.agent"
SERVICE = "pace-agent.service"
TASK_XML = "pace-agent-task.xml"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"

# The graphical session's variables a systemd user service may start without.
SESSION_ENV = ("DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP")

LINUX_PACKAGES = (
    "sudo apt install xdotool xprintidle (Debian, Ubuntu, Mint) · "
    "sudo dnf install xdotool xprintidle (Fedora) · "
    "sudo pacman -S xdotool xprintidle (Arch)"
)


class ProbeError(Exception):
    """The system could not tell which app is in front or how long it was idle."""


# --- Sessions ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Session:
    app: str
    start: float
    end: float

    @property
    def seconds(self) -> float:
        return self.end - self.start


class Tracker:
    """Turns samples into app sessions: the same app joined, idle time cut, glances dropped."""

    def __init__(self) -> None:
        self.current: Optional[Session] = None
        self.finished: list[Session] = []

    def _finish(self) -> None:
        if self.current is not None and self.current.seconds >= MIN_SESSION_SECONDS:
            self.finished.append(self.current)
        self.current = None

    def sample(self, now: float, app: Optional[str], idle: float) -> str:
        """Takes one sample and says what it made of it (for `run --logs`)."""
        current = self.current
        if current is not None and now - current.end > JOIN_GAP_SECONDS:
            self._finish()
            current = None
        if app is None:
            return "no app in front"
        if idle >= IDLE_AFTER_SECONDS:
            if current is not None:
                # Nobody has been here since the last input: the session ends there.
                last_input = now - idle
                self.current = Session(current.app, current.start, max(current.start, min(current.end, last_input)))
                self._finish()
                return f"{app}, idle {idle:.0f} s: away, the session ends at {clock(last_input)}"
            return f"{app}, idle {idle:.0f} s: away"
        if current is not None and current.app == app:
            self.current = Session(app, current.start, now)
            return f"{app}, idle {idle:.0f} s: active since {clock(current.start)}"
        self._finish()
        self.current = Session(app, now, now)
        return f"{app}, idle {idle:.0f} s: active, a new session"

    def running(self) -> Optional[Session]:
        """The session still going, once it is long enough to count."""
        if self.current is not None and self.current.seconds >= MIN_SESSION_SECONDS:
            return self.current
        return None

    def close(self) -> None:
        self._finish()

    def take_finished(self) -> list[Session]:
        finished, self.finished = self.finished, []
        return finished


def iso(instant: float) -> str:
    """UTC with milliseconds and a Z, as the Pace API reads instants."""
    value = datetime.fromtimestamp(instant, tz=timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def clock(instant: float) -> str:
    """Local wall-clock time, for people reading the logs."""
    return datetime.fromtimestamp(instant).strftime("%H:%M:%S")


def session_json(session: Session) -> dict:
    return {"app": session.app[:APP_NAME_MAX], "endAt": iso(session.end), "startAt": iso(session.start)}


def body_of(config: Mapping, sessions: list[dict]) -> dict:
    """What `POST /api/usage/sessions` takes. The server files it under the token's computer."""
    return {"deviceId": config["deviceId"], "deviceName": config["deviceName"], "sessions": sessions}


# --- Sending ----------------------------------------------------------------------------


class Outbox:
    """Finished sessions waiting to be sent, kept in a file so a restart or an outage loses none."""

    def __init__(self, path: Optional[Path]) -> None:
        self.path = path
        self.pending: list[dict] = []
        self.last_sent_at: Optional[float] = None
        self.last_error: Optional[str] = None
        self.failures = 0
        self.next_at = 0.0
        if path is not None and path.exists():
            try:
                saved = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                saved = {}
            self.pending = list(saved.get("pending", []))
            self.last_sent_at = saved.get("lastSentAt")
            self.last_error = saved.get("lastError")

    def add(self, sessions: list[Session]) -> None:
        self.pending.extend(session_json(session) for session in sessions)

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        state = {"lastError": self.last_error, "lastSentAt": self.last_sent_at, "pending": self.pending}
        self.path.write_text(json.dumps(state), encoding="utf-8")

    def flush(self, now: float, running: Optional[Session], deliver: Callable[[list[dict]], None]) -> bool:
        """Sends what waits and the running session (cut at its last sample); False if it failed."""
        oldest = iso(now - KEEP_SECONDS)
        self.pending = [session for session in self.pending if session["endAt"] >= oldest]
        sessions = self.pending + ([session_json(running)] if running is not None else [])
        try:
            while sessions:
                deliver(sessions[:BATCH])
                sessions = sessions[BATCH:]
                self.pending = self.pending[BATCH:]
        except (OSError, ValueError, http.client.HTTPException) as error:
            self.failures += 1
            self.last_error = str(error)
            self.next_at = now + min(SEND_EVERY_SECONDS * 2 ** (self.failures - 1), MAX_BACKOFF_SECONDS)
            self.save()
            return False
        self.pending = []
        self.failures = 0
        self.last_error = None
        self.last_sent_at = now
        self.next_at = now + SEND_EVERY_SECONDS
        self.save()
        return True


def post_sessions(config: Mapping) -> Callable[[list[dict]], None]:
    """Sends one batch with the computer's token; an HTTP error raises (and the batch waits)."""

    def deliver(sessions: list[dict]) -> None:
        request = urllib.request.Request(
            f"{config['api']}/api/usage/sessions",
            data=json.dumps(body_of(config, sessions)).encode(),
            headers={"Authorization": f"Bearer {config['token']}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()

    return deliver


class Agent:
    """One sample at a time, and a send every 5 minutes (only printed with `--logs`)."""

    def __init__(
        self,
        config: Mapping,
        outbox: Outbox,
        *,
        front_app: Callable[[], Optional[str]],
        idle_seconds: Callable[[], float],
        deliver: Callable[[list[dict]], None],
        log: Callable[[str], None],
        logs: bool,
    ) -> None:
        self.config = config
        self.outbox = outbox
        self.front_app = front_app
        self.idle_seconds = idle_seconds
        self.log = log
        self.logs = logs
        self.deliver = self._print if logs else deliver
        self.tracker = Tracker()

    def _print(self, sessions: list[dict]) -> None:
        self.log(f"Would send to {self.config.get('api', '(not installed)')}/api/usage/sessions:")
        self.log(json.dumps(body_of(self.config, sessions), indent=2, ensure_ascii=False))

    def step(self, now: float) -> None:
        try:
            app, idle = self.front_app(), self.idle_seconds()
            decision = self.tracker.sample(now, app, idle)
        except ProbeError as error:
            decision = self.tracker.sample(now, None, 0) + f" ({error})"
        if self.logs:
            self.log(f"{clock(now)}  {decision}")
        if now >= self.outbox.next_at:
            self.send(now)

    def send(self, now: float) -> None:
        self.outbox.add(self.tracker.take_finished())
        running = self.tracker.running()
        if self.logs and not self.outbox.pending and running is None:
            self.log(
                f"Would send to {self.config.get('api', '(not installed)')}/api/usage/sessions: "
                "nothing yet (a session counts once it is a minute long)"
            )
        if not self.outbox.flush(now, running, self.deliver):
            self.log(f"Could not send ({self.outbox.last_error}); kept {len(self.outbox.pending)} sessions to retry")

    def stop(self, now: float) -> None:
        """On shutdown: finish the running session and send once, or keep it for next time."""
        self.tracker.close()
        self.send(now)


# --- Probes -----------------------------------------------------------------------------


def run_command(args: list[str]) -> str:
    """A probe's command output; a missing program or a failure is a ProbeError."""
    try:
        done = subprocess.run(args, capture_output=True, check=True, text=True, timeout=5)
    except FileNotFoundError as error:
        raise ProbeError(f"{args[0]}: not found") from error
    except (OSError, subprocess.SubprocessError) as error:
        raise ProbeError(f"{args[0]}: {error}") from error
    return done.stdout


def parse_lsappinfo_name(output: str) -> Optional[str]:
    """`lsappinfo info -only name` prints `"LSDisplayName"="Safari"`."""
    match = re.search(r'"[^"]*"\s*=\s*"(.*)"', output)
    return match.group(1) if match and match.group(1) else None


def parse_hid_idle(output: str) -> Optional[float]:
    """The first HIDIdleTime of `ioreg -c IOHIDSystem`, in nanoseconds, as seconds."""
    match = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', output)
    return int(match.group(1)) / 1e9 if match else None


def parse_wm_class(output: str) -> Optional[str]:
    """`xprop WM_CLASS` prints the instance and then the class; the class names the app."""
    names = re.findall(r'"([^"]*)"', output)
    return names[-1] if names else None


def parse_gdbus_number(output: str) -> int:
    """A D-Bus reply as gdbus prints it, `(uint32 1234,)`."""
    match = re.search(r"(\d+)\s*,?\)", output)
    if match is None:
        raise ProbeError(f"gdbus: unexpected reply {output.strip()!r}")
    return int(match.group(1))


def exe_name(path: str) -> str:
    """A Windows program's file name without `.exe`."""
    name = PureWindowsPath(path).name
    return name[:-4] if name.lower().endswith(".exe") else name


def idle_from_ticks(tick_ms: int, last_input_ms: int) -> float:
    """Seconds since the last input; GetLastInputInfo's counter is 32 bits and wraps every 49 days."""
    return ((tick_ms - last_input_ms) & 0xFFFFFFFF) / 1000


def macos_front_app() -> Optional[str]:
    front = run_command(["lsappinfo", "front"]).strip()
    if not front:
        return None
    return parse_lsappinfo_name(run_command(["lsappinfo", "info", "-only", "name", front]))


def macos_idle_seconds() -> float:
    idle = parse_hid_idle(run_command(["ioreg", "-c", "IOHIDSystem"]))
    if idle is None:
        raise ProbeError("ioreg: no HIDIdleTime")
    return idle


def is_wayland(environ: Mapping[str, str]) -> bool:
    return environ.get("XDG_SESSION_TYPE") == "wayland" or (
        "WAYLAND_DISPLAY" in environ and "DISPLAY" not in environ
    )


def process_name(pid: str) -> Optional[str]:
    try:
        return Path(f"/proc/{pid.strip()}/comm").read_text().strip() or None
    except OSError:
        return None


def linux_front_app() -> Optional[str]:
    if is_wayland(os.environ):
        return process_name(run_command(["kdotool", "getactivewindow", "getwindowpid"]))
    window = run_command(["xdotool", "getactivewindow"]).strip()
    if not window:
        return None
    try:
        name = process_name(run_command(["xdotool", "getwindowpid", window]))
    except ProbeError:
        # Some windows do not say their process: their class still names the app.
        name = None
    return name or parse_wm_class(run_command(["xprop", "-id", window, "WM_CLASS"]))


def linux_idle_seconds() -> float:
    if is_wayland(os.environ):
        reply = run_command(
            [
                "gdbus",
                "call",
                "--session",
                "--dest",
                "org.freedesktop.ScreenSaver",
                "--object-path",
                "/org/freedesktop/ScreenSaver",
                "--method",
                "org.freedesktop.ScreenSaver.GetSessionIdleTime",
            ]
        )
        return parse_gdbus_number(reply) / 1000
    try:
        return int(run_command(["xprintidle"]).strip()) / 1000
    except ValueError as error:
        raise ProbeError(f"xprintidle: {error}") from error


_DESCRIPTIONS: dict[str, Optional[str]] = {}


def windows_description(path: str) -> Optional[str]:
    """The program's FileDescription ("Firefox", "Visual Studio Code"), read once per program."""
    if path in _DESCRIPTIONS:
        return _DESCRIPTIONS[path]
    import ctypes
    from ctypes import wintypes

    version = ctypes.windll.version  # type: ignore[attr-defined]
    description = None
    size = version.GetFileVersionInfoSizeW(path, None)
    if size:
        data = ctypes.create_string_buffer(size)
        if version.GetFileVersionInfoW(path, 0, size, data):
            pointer, length = ctypes.c_void_p(), wintypes.UINT()
            if version.VerQueryValueW(data, r"\VarFileInfo\Translation", ctypes.byref(pointer), ctypes.byref(length)) and length.value >= 4:
                language, codepage = ctypes.cast(pointer, ctypes.POINTER(wintypes.WORD * 2)).contents
                key = rf"\StringFileInfo\{language:04x}{codepage:04x}\FileDescription"
                if version.VerQueryValueW(data, key, ctypes.byref(pointer), ctypes.byref(length)) and length.value > 1:
                    description = ctypes.wstring_at(pointer.value, length.value - 1).strip() or None
    _DESCRIPTIONS[path] = description
    return description


def windows_front_app() -> Optional[str]:
    import ctypes
    from ctypes import wintypes

    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32  # type: ignore[attr-defined]
    user32.GetForegroundWindow.restype = wintypes.HWND
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.QueryFullProcessImageNameW.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD),
    ]
    window = user32.GetForegroundWindow()
    if not window:
        return None
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(window, ctypes.byref(pid))
    process = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not process:
        raise ProbeError(f"OpenProcess failed for process {pid.value}")
    try:
        size = wintypes.DWORD(1024)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not kernel32.QueryFullProcessImageNameW(process, 0, buffer, ctypes.byref(size)):
            raise ProbeError(f"QueryFullProcessImageNameW failed for process {pid.value}")
    finally:
        kernel32.CloseHandle(process)
    try:
        description = windows_description(buffer.value)
    except OSError:
        description = None
    return description or exe_name(buffer.value)


def windows_idle_seconds() -> float:
    import ctypes
    from ctypes import wintypes

    class LastInputInfo(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

    info = LastInputInfo()
    info.cbSize = ctypes.sizeof(info)
    if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):  # type: ignore[attr-defined]
        raise ProbeError("GetLastInputInfo failed")
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    kernel32.GetTickCount64.restype = ctypes.c_ulonglong
    return idle_from_ticks(kernel32.GetTickCount64(), info.dwTime)


def front_app() -> Optional[str]:
    """The name of the application in front, on this system."""
    if SYSTEM == "Windows":
        return windows_front_app()
    if SYSTEM == "Darwin":
        return macos_front_app()
    return linux_front_app()


def idle_seconds() -> float:
    """Seconds since the last key press or mouse move, on this system."""
    if SYSTEM == "Windows":
        return windows_idle_seconds()
    if SYSTEM == "Darwin":
        return macos_idle_seconds()
    return linux_idle_seconds()


def linux_problem(environ: Mapping[str, str], which: Callable[[str], Optional[str]]) -> Optional[str]:
    """Why the front app cannot be read on this Linux desktop, or None when it can."""
    if is_wayland(environ):
        if which("kdotool") is not None and which("gdbus") is not None:
            return None
        desktop = (environ.get("XDG_CURRENT_DESKTOP") or "this desktop").split(":")[-1]
        return (
            f"Unsupported desktop ({desktop} on Wayland): it does not tell other programs which "
            "window is in front. Log in with an Xorg session (“GNOME on Xorg” at the login "
            "screen), or on KDE Plasma install kdotool."
        )
    if "DISPLAY" not in environ:
        return "No graphical session here (DISPLAY is not set): run it on the computer's desktop."
    missing = [tool for tool in ("xdotool", "xprintidle") if which(tool) is None]
    if missing:
        return f"Missing {', '.join(missing)}. Install: {LINUX_PACKAGES}"
    return None


# --- Settings and autostart ---------------------------------------------------------------


def config_dir(system: str, environ: Mapping[str, str], home: Path) -> Path:
    """Where each system keeps an app's settings."""
    if system == "Windows":
        return Path(environ.get("APPDATA") or home / "AppData" / "Roaming") / "Pace"
    if system == "Darwin":
        return home / "Library" / "Application Support" / "Pace"
    return Path(environ.get("XDG_CONFIG_HOME") or home / ".config") / "pace"


@dataclass
class Plan:
    """Files to write and commands to run; failures of the `optional` commands are fine."""

    files: dict[Path, str] = field(default_factory=dict)
    commands: list[list[str]] = field(default_factory=list)
    optional: set[int] = field(default_factory=set)
    remove: list[Path] = field(default_factory=list)


def systemd_unit(python: str, script: Path) -> str:
    return (
        "[Unit]\n"
        "Description=Pace agent: which app is in front, sent to Pace\n\n"
        "[Service]\n"
        f'ExecStart="{python}" "{script}" run\n'
        "Restart=on-failure\n"
        "RestartSec=30\n\n"
        "[Install]\n"
        "WantedBy=default.target\n"
    )


def launch_agent(python: str, script: Path, log: Path) -> str:
    return plistlib.dumps(
        {
            "KeepAlive": True,
            "Label": LAUNCH_LABEL,
            "ProgramArguments": [python, str(script), "run"],
            "RunAtLoad": True,
            "StandardErrorPath": str(log),
            "StandardOutPath": str(log),
            "ThrottleInterval": 30,
        }
    ).decode()


def task_xml(pythonw: str, script: Path, user: str) -> str:
    """
    A Task Scheduler task at logon, without elevation. Unlike `schtasks /SC ONLOGON`, it also
    starts and keeps running on battery and is never stopped after the default three days.
    """
    return f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Pace agent: which app is in front, sent to Pace</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{escape(user)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{escape(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>10</Count></RestartOnFailure>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{escape(pythonw)}</Command>
      <Arguments>"{escape(str(script))}" run</Arguments>
    </Exec>
  </Actions>
</Task>
"""


def autostart_plan(
    system: str,
    *,
    python: str,
    script: Path,
    home: Path,
    config: Path,
    uid: int = 0,
    user: str = "",
) -> Plan:
    """How this system starts the agent with the computer, and starts it now."""
    if system == "Windows":
        xml = config / TASK_XML
        pythonw = str(PureWindowsPath(python).with_name("pythonw.exe"))
        return Plan(
            files={xml: task_xml(pythonw, script, user)},
            commands=[
                ["schtasks", "/Create", "/F", "/TN", TASK_NAME, "/XML", str(xml)],
                # A reinstall stops the agent that runs with the old settings first.
                ["schtasks", "/End", "/TN", TASK_NAME],
                ["schtasks", "/Run", "/TN", TASK_NAME],
            ],
            optional={1},
        )
    if system == "Darwin":
        plist = home / "Library" / "LaunchAgents" / f"{LAUNCH_LABEL}.plist"
        return Plan(
            files={plist: launch_agent(python, script, config / "agent.log")},
            commands=[
                ["launchctl", "bootout", f"gui/{uid}/{LAUNCH_LABEL}"],
                ["launchctl", "bootstrap", f"gui/{uid}", str(plist)],
            ],
            optional={0},
        )
    return Plan(
        files={home / ".config" / "systemd" / "user" / SERVICE: systemd_unit(python, script)},
        commands=[
            ["systemctl", "--user", "daemon-reload"],
            ["systemctl", "--user", "enable", SERVICE],
            ["systemctl", "--user", "restart", SERVICE],
        ],
    )


def removal_plan(system: str, *, home: Path, config: Path, uid: int = 0) -> Plan:
    """Undoes `autostart_plan` and forgets the settings; every command may fail harmlessly."""
    settings = [config / name for name in ("config.json", "buffer.json", "agent.log", "agent.lock", TASK_XML)]
    if system == "Windows":
        commands = [["schtasks", "/End", "/TN", TASK_NAME], ["schtasks", "/Delete", "/F", "/TN", TASK_NAME]]
        remove = settings
    elif system == "Darwin":
        commands = [["launchctl", "bootout", f"gui/{uid}/{LAUNCH_LABEL}"]]
        remove = [home / "Library" / "LaunchAgents" / f"{LAUNCH_LABEL}.plist", *settings]
    else:
        commands = [["systemctl", "--user", "disable", "--now", SERVICE]]
        remove = [home / ".config" / "systemd" / "user" / SERVICE, *settings]
    return Plan(commands=commands, optional=set(range(len(commands))), remove=remove)


# --- Commands ---------------------------------------------------------------------------


def _run_quietly(command: list[str]) -> int:
    try:
        return subprocess.run(command, capture_output=True, check=False).returncode
    except OSError:
        return 127


@dataclass
class Env:
    """The computer the commands act on; the tests swap it for a temporary one."""

    system: str = SYSTEM
    config: Optional[Path] = None
    home: Path = field(default_factory=Path.home)
    environ: Mapping[str, str] = field(default_factory=lambda: dict(os.environ))
    which: Callable[[str], Optional[str]] = shutil.which
    run: Callable[[list[str]], int] = _run_quietly
    # Under pythonw (Windows autostart) there is no stdout; `status` still shows the last error.
    out: IO[str] = field(default_factory=lambda: sys.stdout or open(os.devnull, "w"))
    python: str = sys.executable
    script: Path = field(default_factory=lambda: Path(__file__).resolve())
    uid: int = field(default_factory=lambda: os.getuid() if hasattr(os, "getuid") else 0)
    user: str = field(
        default_factory=lambda: "\\".join(
            part for part in (os.environ.get("USERDOMAIN"), os.environ.get("USERNAME")) if part
        )
    )

    @property
    def dir(self) -> Path:
        return self.config or config_dir(self.system, self.environ, self.home)

    def say(self, text: str) -> None:
        print(text, file=self.out)


def load_config(env: Env) -> dict:
    try:
        return json.loads((env.dir / "config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def problem_of(system: str, environ: Mapping[str, str], which: Callable[[str], Optional[str]]) -> Optional[str]:
    """Why this computer's front app cannot be read (only some Linux desktops), or None."""
    if system in ("Windows", "Darwin"):
        return None
    return linux_problem(environ, which)


def logs_command(env: Env) -> str:
    return f'"{env.python}" "{env.script}" run --logs'


def run_plan(env: Env, plan: Plan) -> bool:
    for path, text in plan.files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        # Task Scheduler reads its XML as UTF-16.
        path.write_text(text, encoding="utf-16" if path.suffix == ".xml" else "utf-8")
    for index, command in enumerate(plan.commands):
        if env.run(command) != 0 and index not in plan.optional:
            env.say(f"Failed: {' '.join(command)}")
            return False
    return True


def windows_run_key(env: Env, *, remove: bool) -> None:
    """Without Task Scheduler (some managed computers forbid it), the user's Run key starts it."""
    import winreg  # type: ignore[import-not-found]

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:  # type: ignore[attr-defined]
        if remove:
            try:
                winreg.DeleteValue(key, TASK_NAME)  # type: ignore[attr-defined]
            except OSError:
                pass
            return
        pythonw = str(PureWindowsPath(env.python).with_name("pythonw.exe"))
        winreg.SetValueEx(key, TASK_NAME, 0, winreg.REG_SZ, f'"{pythonw}" "{env.script}" run')  # type: ignore[attr-defined]


def install(args: argparse.Namespace, env: Env) -> int:
    problem = problem_of(env.system, env.environ, env.which)
    if problem is not None:
        env.say(problem)
        return 3
    previous = load_config(env)
    config = {
        "api": args.api.rstrip("/"),
        "deviceId": previous.get("deviceId") or str(uuid.uuid4()),
        "deviceName": args.name or socket.gethostname(),
        "token": args.token,
    }
    if env.system not in ("Windows", "Darwin"):
        # A user service may start before the desktop: it takes the display from here.
        config["env"] = {name: env.environ[name] for name in SESSION_ENV if name in env.environ}
    env.dir.mkdir(parents=True, exist_ok=True)
    path = env.dir / "config.json"
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    path.chmod(0o600)
    env.say(f"Saved the settings to {path}.")
    if env.system not in ("Windows", "Darwin") and env.which("systemctl") is None:
        env.say(f"No systemd here: add `{env.python} {env.script} run` to your desktop's autostart.")
        return 0
    plan = autostart_plan(
        env.system, python=env.python, script=env.script, home=env.home, config=env.dir, uid=env.uid, user=env.user
    )
    if not run_plan(env, plan):
        if env.system != "Windows":
            return 1
        env.say("Task Scheduler refused: it starts from the Run key of your account instead.")
        windows_run_key(env, remove=False)
        subprocess.Popen([str(PureWindowsPath(env.python).with_name("pythonw.exe")), str(env.script), "run"])
    env.say("Installed: it starts with the computer and sends app names and times every 5 minutes.")
    env.say(f"To see what it sends: {logs_command(env)}")
    return 0


def status(env: Env) -> int:
    config = load_config(env)
    if not config:
        env.say(f"Not installed (no settings in {env.dir}).")
        return 2
    outbox = Outbox(env.dir / "buffer.json")
    sent = outbox.last_sent_at
    waiting = len(outbox.pending)
    env.say(f"Settings: {env.dir / 'config.json'}")
    env.say(f"Server: {config.get('api')}")
    env.say(f"Computer: {config.get('deviceName')}")
    env.say(f"Last send: {'never' if sent is None else datetime.fromtimestamp(sent).strftime('%Y-%m-%d %H:%M:%S')}")
    env.say(f"Waiting to send: {waiting} session{'' if waiting == 1 else 's'}")
    if outbox.last_error:
        env.say(f"Last error: {outbox.last_error}")
    return 0


def uninstall(env: Env) -> int:
    plan = removal_plan(env.system, home=env.home, config=env.dir, uid=env.uid)
    run_plan(env, plan)
    if env.system == "Windows":
        try:
            windows_run_key(env, remove=True)
        except OSError:
            pass
    for path in plan.remove:
        try:
            path.unlink()
        except OSError:
            pass
    if env.system not in ("Windows", "Darwin"):
        env.run(["systemctl", "--user", "daemon-reload"])
    env.say("Removed. Disconnect this computer in Pace → Settings → Devices too.")
    return 0


def lock(path: Path) -> Optional[IO[str]]:
    """One agent per user: a second `run` would send every session twice."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Held open for the whole run: the lock lasts as long as the handle.
    handle = open(path, "a+")
    try:
        if SYSTEM == "Windows":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)  # type: ignore[attr-defined]
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def run(logs: bool, env: Env) -> int:
    config = load_config(env)
    if not config and not logs:
        env.say("Not installed: run `pace_agent.py install --token TOKEN --api URL` first.")
        return 2
    for name, value in config.get("env", {}).items():
        os.environ.setdefault(name, value)
    problem = problem_of(env.system, os.environ, env.which)
    if problem is not None:
        env.say(problem)
        if not logs:
            return 3
    config = {"deviceId": "(not installed)", "deviceName": socket.gethostname(), **config}
    if logs:
        env.say("Logs only: each sample and what it would send every 5 minutes; nothing is sent. Ctrl+C stops.")
        outbox, handle = Outbox(None), None
    else:
        handle = lock(env.dir / "agent.lock")
        if handle is None:
            env.say("Already running.")
            return 0
        outbox = Outbox(env.dir / "buffer.json")
    agent = Agent(
        config,
        outbox,
        front_app=front_app,
        idle_seconds=idle_seconds,
        deliver=post_sessions(config),
        log=env.say,
        logs=logs,
    )

    def interrupt(signum: int, frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    try:
        while True:
            agent.step(time.time())
            env.out.flush()
            time.sleep(SAMPLE_EVERY_SECONDS)
    except KeyboardInterrupt:
        agent.stop(time.time())
    finally:
        if handle is not None:
            handle.close()
    return 0


def main(argv: list[str], env: Optional[Env] = None) -> int:
    env = env or Env()
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("install", help="save the settings and start with the computer")
    setup.add_argument("--token", required=True, help="this computer's token from Pace")
    setup.add_argument("--api", required=True, help="the Pace server, e.g. https://pace-api.example")
    setup.add_argument("--name", help="how this computer is named (default: its hostname)")
    once = commands.add_parser("run", help="sample every 5 seconds and send every 5 minutes")
    once.add_argument("--logs", action="store_true", help="print each sample and what it would send; send nothing")
    commands.add_parser("status", help="the settings, the last send and what waits to be sent")
    commands.add_parser("uninstall", help="stop starting with the computer and forget the settings")
    args = parser.parse_args(argv)
    try:
        if args.command == "install":
            return install(args, env)
        if args.command == "status":
            return status(env)
        if args.command == "uninstall":
            return uninstall(env)
        return run(args.logs, env)
    except urllib.error.URLError as error:
        env.say(f"Cannot reach the server: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
