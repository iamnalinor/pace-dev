"""Tests for Pace's desktop agent: python3 -m unittest discover -s tools/pace-agent"""

from __future__ import annotations

import io
import json
import plistlib
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pace_agent as agent


def at(hhmmss: str) -> float:
    """A wall-clock instant on the test day, as epoch seconds."""
    return datetime.fromisoformat(f"2026-10-06T{hhmmss}+00:00").timestamp()


def samples(tracker: agent.Tracker, start: str, seconds: int, app: str | None, idle: float = 1) -> float:
    """One sample every 5 seconds over `seconds` from `start`; returns the time after the last."""
    now = at(start)
    for _ in range(seconds // agent.SAMPLE_EVERY_SECONDS):
        tracker.sample(now, app, idle)
        now += agent.SAMPLE_EVERY_SECONDS
    return now


class TrackerTest(unittest.TestCase):
    def test_joins_samples_of_one_app_across_short_gaps(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 120, "firefox")
        # Half a minute without samples (a busy or briefly sleeping computer): still one session.
        samples(tracker, "10:02:30", 60, "firefox")
        samples(tracker, "10:03:30", 120, "code")
        tracker.close()
        self.assertEqual(
            tracker.take_finished(),
            [
                agent.Session("firefox", at("10:00:00"), at("10:03:25")),
                agent.Session("code", at("10:03:30"), at("10:05:25")),
            ],
        )

    def test_cuts_a_session_at_the_last_input_once_idle(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 300, "firefox")
        # Idle for 70 s at 10:05:30: the last key or mouse move was at 10:04:20.
        tracker.sample(at("10:05:30"), "firefox", 70)
        samples(tracker, "10:20:00", 120, "firefox")
        tracker.close()
        self.assertEqual(
            tracker.take_finished(),
            [
                agent.Session("firefox", at("10:00:00"), at("10:04:20")),
                agent.Session("firefox", at("10:20:00"), at("10:21:55")),
            ],
        )

    def test_a_different_app_in_between_splits_the_session(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 120, "firefox")
        samples(tracker, "10:02:00", 10, "telegram")
        samples(tracker, "10:02:10", 120, "firefox")
        tracker.close()
        self.assertEqual(
            [session.app for session in tracker.take_finished()], ["firefox", "firefox"]
        )

    def test_drops_glances_and_samples_without_an_app(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 30, "calculator")
        samples(tracker, "10:00:30", 300, None)
        tracker.close()
        self.assertEqual(tracker.take_finished(), [])

    def test_a_long_pause_finishes_the_session_without_a_close(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 120, "code")
        # The laptop slept: the next sample is an hour later.
        tracker.sample(at("11:00:00"), "code", 1)
        self.assertEqual(tracker.take_finished(), [agent.Session("code", at("10:00:00"), at("10:01:55"))])
        self.assertIsNone(tracker.running())

    def test_the_running_session_counts_once_it_is_a_minute_long(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 30, "code")
        self.assertIsNone(tracker.running())
        samples(tracker, "10:00:30", 60, "code")
        self.assertEqual(tracker.running(), agent.Session("code", at("10:00:00"), at("10:01:25")))


class BoundaryTest(unittest.TestCase):
    """The minute limits, pinned on both sides: a gap, the idle time and a session's length."""

    def session_across_gap(self, gap: int) -> list[agent.Session]:
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 120, "code")  # the last sample at 10:01:55
        # After the gap, two more minutes of samples every 5 s.
        for offset in range(0, 120, agent.SAMPLE_EVERY_SECONDS):
            tracker.sample(at("10:01:55") + gap + offset, "code", 1)
        tracker.close()
        return tracker.take_finished()

    def test_a_gap_under_a_minute_joins_and_a_minute_splits(self):
        self.assertEqual(len(self.session_across_gap(59)), 1)
        self.assertEqual(len(self.session_across_gap(60)), 2)
        self.assertEqual(len(self.session_across_gap(61)), 2)

    def test_idle_under_a_minute_is_active_and_a_minute_is_away(self):
        tracker = agent.Tracker()
        samples(tracker, "10:00:00", 120, "code")
        self.assertIn("active", tracker.sample(at("10:02:00"), "code", 59))
        self.assertEqual(tracker.running().end, at("10:02:00"))
        self.assertIn("away", tracker.sample(at("10:02:05"), "code", 60))
        self.assertIsNone(tracker.running())
        self.assertEqual(tracker.take_finished(), [agent.Session("code", at("10:00:00"), at("10:01:05"))])

    def session_of(self, seconds: int) -> list[agent.Session]:
        tracker = agent.Tracker()
        tracker.sample(at("10:00:00"), "code", 1)
        for offset in range(5, seconds, 5):
            tracker.sample(at("10:00:00") + offset, "code", 1)
        tracker.sample(at("10:00:00") + seconds, "code", 1)
        tracker.close()
        return tracker.take_finished()

    def test_a_session_counts_from_a_minute(self):
        self.assertEqual(self.session_of(59), [])
        self.assertEqual(len(self.session_of(60)), 1)
        self.assertEqual(len(self.session_of(61)), 1)


class BodyTest(unittest.TestCase):
    def test_sends_app_names_and_times_under_the_device(self):
        config = {"deviceId": "d1", "deviceName": "laptop"}
        body = agent.body_of(config, [agent.session_json(agent.Session("code", at("10:00:00"), at("10:02:00")))])
        self.assertEqual(
            body,
            {
                "deviceId": "d1",
                "deviceName": "laptop",
                "sessions": [
                    {"app": "code", "endAt": "2026-10-06T10:02:00.000Z", "startAt": "2026-10-06T10:00:00.000Z"}
                ],
            },
        )

    def test_cuts_long_app_names_to_what_the_server_takes(self):
        long = agent.session_json(agent.Session("x" * 300, at("10:00:00"), at("10:02:00")))
        self.assertEqual(len(long["app"]), 120)


class OutboxTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.path = self.dir / "buffer.json"
        self.sent: list[list[dict]] = []

    def deliver(self, sessions: list[dict]) -> None:
        self.sent.append(sessions)

    def fail(self, sessions: list[dict]) -> None:
        raise OSError("offline")

    def test_keeps_sessions_on_a_failed_send_and_sends_them_with_the_next(self):
        outbox = agent.Outbox(self.path)
        outbox.add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
        self.assertFalse(outbox.flush(at("10:05:00"), None, self.fail))
        self.assertEqual(outbox.last_error, "offline")
        # A restart reads the buffer back.
        again = agent.Outbox(self.path)
        self.assertEqual(len(again.pending), 1)
        again.add([agent.Session("firefox", at("10:06:00"), at("10:08:00"))])
        running = agent.Session("code", at("10:09:00"), at("10:10:00"))
        self.assertTrue(again.flush(at("10:10:00"), running, self.deliver))
        self.assertEqual([s["app"] for s in self.sent[0]], ["code", "firefox", "code"])
        self.assertEqual(again.pending, [])
        self.assertEqual(again.last_sent_at, at("10:10:00"))
        self.assertIsNone(again.last_error)
        self.assertEqual(json.loads(self.path.read_text())["pending"], [])

    def test_backs_off_after_failures_and_returns_to_five_minutes(self):
        outbox = agent.Outbox(self.path)
        outbox.add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
        outbox.flush(at("10:05:00"), None, self.fail)
        self.assertEqual(outbox.next_at, at("10:10:00"))
        outbox.flush(at("10:10:00"), None, self.fail)
        self.assertEqual(outbox.next_at, at("10:20:00"))
        for _ in range(10):
            outbox.flush(at("10:20:00"), None, self.fail)
        self.assertEqual(outbox.next_at, at("11:20:00"))
        outbox.flush(at("11:20:00"), None, self.deliver)
        self.assertEqual(outbox.next_at, at("11:25:00"))

    def test_drops_what_is_older_than_a_week(self):
        outbox = agent.Outbox(self.path)
        outbox.add([agent.Session("code", at("10:00:00") - 8 * 86400, at("10:02:00") - 8 * 86400)])
        outbox.add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
        outbox.flush(at("10:05:00"), None, self.deliver)
        self.assertEqual(len(self.sent[0]), 1)

    def test_sends_in_batches_the_server_accepts(self):
        outbox = agent.Outbox(self.path)
        outbox.add([agent.Session("code", at("10:00:00") + i, at("10:02:00") + i) for i in range(1200)])
        outbox.flush(at("10:30:00"), None, self.deliver)
        self.assertEqual([len(batch) for batch in self.sent], [500, 500, 200])

    def test_sends_nothing_when_there_is_nothing_and_that_is_no_send(self):
        outbox = agent.Outbox(self.path)
        self.assertTrue(outbox.flush(at("10:05:00"), None, self.deliver))
        self.assertEqual(self.sent, [])
        self.assertIsNone(outbox.last_sent_at)
        self.assertEqual(outbox.next_at, at("10:10:00"))

    def test_keeps_finished_sessions_on_disk_at_once(self):
        # A power cut during the backoff must not lose what was already finished.
        agent.Outbox(self.path).add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
        self.assertEqual(len(agent.Outbox(self.path).pending), 1)
        # Written whole and renamed into place: no temporary file is left behind.
        self.assertEqual([p.name for p in self.dir.iterdir()], ["buffer.json"])

    def test_sets_a_broken_buffer_aside_and_starts_empty(self):
        for broken in ('{"pending": [{"app": "co', "[]", '{"pending": "x"}', '{"pending": [1, {"app": "a"}]}'):
            with self.subTest(broken=broken):
                self.path.write_text(broken)
                outbox = agent.Outbox(self.path)
                self.assertEqual(outbox.pending, [])
                self.assertEqual((self.dir / "buffer.json.bad").read_text(), broken)
                outbox.add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
                self.assertEqual(len(agent.Outbox(self.path).pending), 1)


class AgentTest(unittest.TestCase):
    def make(self, apps: list[str | None], *, logs: bool, deliver=None):
        self.lines: list[str] = []
        probe = iter(apps)
        return agent.Agent(
            {"api": "https://api.pace.test", "deviceId": "d1", "deviceName": "laptop", "token": "t"},
            agent.Outbox(None),
            front_app=lambda: next(probe),
            idle_seconds=lambda: 2.0,
            deliver=deliver or (lambda sessions: None),
            log=self.lines.append,
            logs=logs,
        )

    def test_logs_mode_prints_each_decision_and_the_body_it_would_send(self):
        runner = self.make(["code"] * 70, logs=True)
        now = at("10:00:00")
        for _ in range(70):
            runner.step(now)
            now += agent.SAMPLE_EVERY_SECONDS
        decisions = [line for line in self.lines if "code" in line and "idle 2 s" in line]
        self.assertEqual(len(decisions), 70)
        self.assertIn(datetime.fromtimestamp(at("10:00:00")).strftime("%H:%M:%S"), self.lines[0])
        sends = [i for i, line in enumerate(self.lines) if line.startswith("Would send to https://api.pace.test/api/usage/sessions")]
        # Nothing at the first sample; at 10:05:00 the running session, cut at that sample.
        self.assertEqual(len(sends), 2)
        body = json.loads(self.lines[sends[1] + 1])
        self.assertEqual(
            body["sessions"],
            [{"app": "code", "endAt": "2026-10-06T10:05:00.000Z", "startAt": "2026-10-06T10:00:00.000Z"}],
        )

    def test_a_failing_probe_is_a_sample_without_an_app(self):
        def broken() -> str | None:
            raise agent.ProbeError("xdotool: not found")

        lines: list[str] = []
        runner = agent.Agent(
            {"deviceId": "d1", "deviceName": "laptop"},
            agent.Outbox(None),
            front_app=broken,
            idle_seconds=lambda: 0.0,
            deliver=lambda sessions: None,
            log=lines.append,
            logs=True,
        )
        runner.step(at("10:00:00"))
        self.assertIn("xdotool: not found", lines[0])

    def test_any_probe_failure_keeps_the_loop_going(self):
        for error in (OSError("access denied"), UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")):

            def broken(error: Exception = error) -> str | None:
                raise error

            lines: list[str] = []
            runner = agent.Agent(
                {"deviceId": "d1", "deviceName": "laptop"},
                agent.Outbox(None),
                front_app=broken,
                idle_seconds=lambda: 0.0,
                deliver=lambda sessions: None,
                log=lines.append,
                logs=True,
            )
            runner.step(at("10:00:00"))
            self.assertIn("no app in front", lines[0])

    def test_stop_sends_what_it_has(self):
        sent: list[list[dict]] = []
        runner = self.make(["code"] * 20, logs=False, deliver=sent.append)
        now = at("10:00:00")
        for _ in range(20):
            runner.step(now)
            now += agent.SAMPLE_EVERY_SECONDS
        runner.stop(now)
        self.assertEqual([s["app"] for s in sent[-1]], ["code"])


class ProbesTest(unittest.TestCase):
    def test_reads_the_front_app_of_macos(self):
        self.assertEqual(agent.parse_lsappinfo_name('"LSDisplayName"="Visual Studio Code"\n'), "Visual Studio Code")
        self.assertEqual(agent.parse_lsappinfo_name('"name"="Safari"'), "Safari")
        self.assertIsNone(agent.parse_lsappinfo_name(""))

    def test_reads_the_idle_time_of_macos_in_nanoseconds(self):
        output = '    | |   "HIDIdleTime" = 2500000000\n    | |   "HIDIdleTime" = 9\n'
        self.assertEqual(agent.parse_hid_idle(output), 2.5)

    def test_reads_the_window_class_from_xprop(self):
        self.assertEqual(agent.parse_wm_class('WM_CLASS(STRING) = "Navigator", "firefox"\n'), "firefox")
        self.assertIsNone(agent.parse_wm_class("WM_CLASS:  not found.\n"))

    def test_reads_a_number_from_gdbus(self):
        self.assertEqual(agent.parse_gdbus_number("(uint32 1234,)\n"), 1234)

    def test_names_a_windows_program_by_its_exe(self):
        self.assertEqual(agent.exe_name(r"C:\Program Files\Mozilla Firefox\firefox.exe"), "firefox")
        self.assertEqual(agent.exe_name(r"C:\Windows\explorer.EXE"), "explorer")

    def test_windows_idle_survives_the_tick_counter_wrapping(self):
        self.assertEqual(agent.idle_from_ticks(2**32 + 1000, 2**32 - 4000), 5.0)
        self.assertEqual(agent.idle_from_ticks(10_000, 4_000), 6.0)


class RunCommandTest(unittest.TestCase):
    def test_reads_output_that_is_not_utf8(self):
        output = agent.run_command([sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'caf\\xe9')"])
        self.assertEqual(output, "caf\ufffd")

    def test_a_missing_program_is_a_probe_error(self):
        with self.assertRaises(agent.ProbeError):
            agent.run_command(["pace-no-such-program"])


class SessionEnvTest(unittest.TestCase):
    def test_reads_the_desktop_variables_from_the_user_manager(self):
        output = "HOME=/home/me\nDISPLAY=:1\nXAUTHORITY=/tmp/xauth_AbCd\nLANG=en_US.UTF-8\n"
        environ = {"DISPLAY": ":0", "XAUTHORITY": "/tmp/xauth_old"}
        agent.refresh_session_env(environ, lambda: output)
        self.assertEqual(environ, {"DISPLAY": ":1", "XAUTHORITY": "/tmp/xauth_AbCd"})

    def test_keeps_what_it_has_when_the_manager_says_nothing(self):
        environ = {"DISPLAY": ":0"}

        def fails() -> str:
            raise agent.ProbeError("systemctl: not found")

        agent.refresh_session_env(environ, fails)
        self.assertEqual(environ, {"DISPLAY": ":0"})


class ConsoleTest(unittest.TestCase):
    def test_prints_any_app_name_on_a_windows_console(self):
        raw = io.BytesIO()
        stream = io.TextIOWrapper(raw, encoding="cp1252")
        agent.safe_console(stream)
        print("微信 → Пейс", file=stream)
        stream.flush()
        self.assertEqual(raw.getvalue(), b"?? ? ????\n")


class LinuxProblemTest(unittest.TestCase):
    def test_gnome_on_wayland_is_not_supported(self):
        problem = agent.linux_problem(
            {"XDG_SESSION_TYPE": "wayland", "XDG_CURRENT_DESKTOP": "ubuntu:GNOME"}, lambda tool: None
        )
        self.assertIsNotNone(problem)
        self.assertTrue(problem.startswith("Unsupported desktop (GNOME on Wayland)"))

    def test_kde_on_wayland_works_with_kdotool(self):
        env = {"XDG_SESSION_TYPE": "wayland", "XDG_CURRENT_DESKTOP": "KDE"}
        self.assertIsNone(agent.linux_problem(env, lambda tool: f"/usr/bin/{tool}"))

    def test_x11_needs_xdotool_and_xprintidle(self):
        problem = agent.linux_problem(
            {"XDG_SESSION_TYPE": "x11", "DISPLAY": ":0"}, lambda tool: "/usr/bin/xdotool" if tool == "xdotool" else None
        )
        self.assertIn("xprintidle", problem)
        self.assertIn("sudo apt install xdotool xprintidle", problem)
        self.assertIsNone(agent.linux_problem({"DISPLAY": ":0"}, lambda tool: f"/usr/bin/{tool}"))


class PathsTest(unittest.TestCase):
    def test_keeps_its_settings_where_each_system_expects_them(self):
        home = Path("/home/me")
        self.assertEqual(
            agent.config_dir("Windows", {"APPDATA": r"C:\Users\me\AppData\Roaming"}, home),
            Path(r"C:\Users\me\AppData\Roaming") / "Pace",
        )
        self.assertEqual(agent.config_dir("Darwin", {}, home), home / "Library" / "Application Support" / "Pace")
        self.assertEqual(agent.config_dir("Linux", {}, home), home / ".config" / "pace")
        self.assertEqual(agent.config_dir("Linux", {"XDG_CONFIG_HOME": "/xdg"}, home), Path("/xdg") / "pace")


class AutostartTest(unittest.TestCase):
    def test_linux_runs_a_systemd_user_service_with_this_python(self):
        plan = agent.autostart_plan(
            "Linux",
            python="/usr/bin/python3",
            script=Path("/home/me/.pace_agent.py"),
            home=Path("/home/me"),
            config=Path("/home/me/.config/pace"),
        )
        unit = plan.files[Path("/home/me/.config/systemd/user/pace-agent.service")]
        self.assertIn('ExecStart="/usr/bin/python3" "/home/me/.pace_agent.py" run', unit)
        self.assertIn("Restart=on-failure", unit)
        self.assertIn("WantedBy=default.target", unit)
        self.assertEqual(
            plan.commands,
            [
                ["systemctl", "--user", "daemon-reload"],
                ["systemctl", "--user", "enable", "pace-agent.service"],
                ["systemctl", "--user", "restart", "pace-agent.service"],
            ],
        )

    def test_linux_unit_escapes_what_systemd_would_expand(self):
        unit = agent.systemd_unit("/opt/py 3/python3", Path('/home/me/100%/$HOME/a"b\\c.py'))
        self.assertIn(r'ExecStart="/opt/py 3/python3" "/home/me/100%%/$$HOME/a\"b\\c.py" run', unit)

    def test_macos_loads_a_launch_agent_that_stays_alive(self):
        plan = agent.autostart_plan(
            "Darwin",
            python="/usr/bin/python3",
            script=Path("/Users/me/.pace_agent.py"),
            home=Path("/Users/me"),
            config=Path("/Users/me/Library/Application Support/Pace"),
            uid=501,
        )
        path = Path("/Users/me/Library/LaunchAgents/app.pace.agent.plist")
        plist = plistlib.loads(plan.files[path].encode())
        self.assertEqual(plist["ProgramArguments"], ["/usr/bin/python3", "/Users/me/.pace_agent.py", "run"])
        self.assertTrue(plist["KeepAlive"])
        self.assertTrue(plist["RunAtLoad"])
        self.assertEqual(plist["StandardErrorPath"], "/Users/me/Library/Application Support/Pace/agent.log")
        self.assertEqual(
            plan.commands,
            [
                ["launchctl", "bootout", "gui/501/app.pace.agent"],
                ["launchctl", "bootstrap", "gui/501", str(path)],
            ],
        )
        self.assertEqual(plan.optional, {0})

    def test_windows_registers_a_logon_task_that_runs_pythonw(self):
        config = Path(r"C:\Users\me\AppData\Roaming\Pace")
        plan = agent.autostart_plan(
            "Windows",
            python=r"C:\Python312\python.exe",
            script=config / "pace_agent.py",
            home=Path(r"C:\Users\me"),
            config=config,
            user=r"DESK\me",
        )
        xml = plan.files[config / "pace-agent-task.xml"]
        self.assertIn("<LogonTrigger>", xml)
        self.assertIn(r"<UserId>DESK\me</UserId>", xml)
        self.assertIn("<RunLevel>LeastPrivilege</RunLevel>", xml)
        # A laptop on battery keeps it, and it runs for longer than the default three days.
        self.assertIn("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>", xml)
        self.assertIn("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>", xml)
        self.assertIn(r"<Command>C:\Python312\pythonw.exe</Command>", xml)
        self.assertIn(rf'<Arguments>"{config / "pace_agent.py"}" run</Arguments>', xml)

        self.assertEqual(
            plan.commands,
            [
                ["schtasks", "/Create", "/F", "/TN", "Pace agent", "/XML", str(config / "pace-agent-task.xml")],
                ["schtasks", "/End", "/TN", "Pace agent"],
                ["schtasks", "/Run", "/TN", "Pace agent"],
            ],
        )
        self.assertEqual(plan.optional, {1})

    def test_windows_task_without_a_known_user_runs_as_whoever_registers_it(self):
        xml = agent.task_xml(r"C:\Python312\pythonw.exe", Path(r"C:\Pace\pace_agent.py"), "")
        self.assertNotIn("<UserId>", xml)
        self.assertIn("<LogonTrigger>", xml)

    def test_windows_escapes_the_task_xml(self):
        xml = agent.task_xml(r"C:\P&Q\pythonw.exe", Path(r"C:\Users\a<b\pace_agent.py"), "DESK\\a<b")
        self.assertIn(r"C:\P&amp;Q\pythonw.exe", xml)
        self.assertIn(r"DESK\a&lt;b", xml)

    def test_uninstall_undoes_each_system_s_autostart(self):
        linux = agent.removal_plan("Linux", home=Path("/home/me"), config=Path("/home/me/.config/pace"))
        self.assertEqual(linux.commands[0], ["systemctl", "--user", "disable", "--now", "pace-agent.service"])
        self.assertIn(Path("/home/me/.config/systemd/user/pace-agent.service"), linux.remove)
        windows = agent.removal_plan("Windows", home=Path("C:/Users/me"), config=Path("C:/Users/me/Pace"))
        self.assertIn(["schtasks", "/Delete", "/F", "/TN", "Pace agent"], windows.commands)
        mac = agent.removal_plan("Darwin", home=Path("/Users/me"), config=Path("/Users/me/Pace"), uid=501)
        self.assertEqual(mac.commands, [["launchctl", "bootout", "gui/501/app.pace.agent"]])


class CommandsTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.out = io.StringIO()
        self.ran: list[list[str]] = []

    def env(self) -> agent.Env:
        return agent.Env(
            system="Linux",
            config=self.dir / "pace",
            home=self.dir,
            environ={"DISPLAY": ":0", "XDG_SESSION_TYPE": "x11", "XAUTHORITY": "/tmp/xauth_x"},
            which=lambda tool: f"/usr/bin/{tool}",
            run=lambda command: self.ran.append(command) or 0,
            out=self.out,
            python="/usr/bin/python3",
            script=self.dir / ".pace_agent.py",
        )

    def test_install_saves_the_settings_privately_and_starts_the_service(self):
        code = agent.main(["install", "--token", "tok", "--api", "https://api.pace.test/", "--name", "Mint"], self.env())
        self.assertEqual(code, 0)
        config = json.loads((self.dir / "pace" / "config.json").read_text())
        self.assertEqual(config["api"], "https://api.pace.test")
        self.assertEqual(config["token"], "tok")
        self.assertEqual(config["deviceName"], "Mint")
        self.assertEqual(config["env"]["DISPLAY"], ":0")
        # A display manager may put the X cookie in a fresh temporary file at each login.
        self.assertNotIn("XAUTHORITY", config["env"])
        self.assertEqual((self.dir / "pace" / "config.json").stat().st_mode & 0o777, 0o600)
        self.assertIn(["systemctl", "--user", "restart", "pace-agent.service"], self.ran)
        self.assertIn("run --logs", self.out.getvalue())

    def test_install_refuses_a_desktop_it_cannot_read(self):
        env = self.env()
        env.environ = {"XDG_SESSION_TYPE": "wayland", "XDG_CURRENT_DESKTOP": "GNOME"}
        env.which = lambda tool: None
        code = agent.main(["install", "--token", "tok", "--api", "https://api.pace.test"], env)
        self.assertEqual(code, 3)
        self.assertIn("Unsupported desktop (GNOME on Wayland)", self.out.getvalue())
        self.assertFalse((self.dir / "pace" / "config.json").exists())

    def test_status_tells_the_settings_the_last_send_and_the_buffer(self):
        env = self.env()
        agent.main(["install", "--token", "s3cr3t-token", "--api", "https://api.pace.test"], env)
        outbox = agent.Outbox(self.dir / "pace" / "buffer.json")
        outbox.add([agent.Session("code", at("10:00:00"), at("10:02:00"))])
        outbox.save()
        self.out.truncate(0)
        self.assertEqual(agent.main(["status"], env), 0)
        text = self.out.getvalue()
        self.assertIn("https://api.pace.test", text)
        self.assertIn("Last send: never", text)
        self.assertIn("Waiting to send: 1 session", text)
        self.assertNotIn("s3cr3t", text)

    def test_uninstall_removes_the_service_and_the_settings(self):
        env = self.env()
        agent.main(["install", "--token", "tok", "--api", "https://api.pace.test"], env)
        self.assertEqual(agent.main(["uninstall"], env), 0)
        self.assertFalse((self.dir / "pace" / "config.json").exists())
        self.assertFalse((self.dir / ".config" / "systemd" / "user" / "pace-agent.service").exists())
        self.assertIn(["systemctl", "--user", "disable", "--now", "pace-agent.service"], self.ran)


if __name__ == "__main__":
    unittest.main()
