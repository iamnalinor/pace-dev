"""Tests for the desktop bridge: python3 -m unittest discover tools/pace-aw-bridge"""

import unittest
from datetime import datetime, timezone

import pace_aw_bridge as bridge


def window(start: str, seconds: float, app: str, title: str = "secret") -> dict:
    return {"data": {"app": app, "title": title}, "duration": seconds, "timestamp": f"2026-10-06T{start}Z"}


def afk(start: str, seconds: float, status: str) -> dict:
    return {"data": {"status": status}, "duration": seconds, "timestamp": f"2026-10-06T{start}Z"}


def at(hhmmss: str) -> datetime:
    return datetime.fromisoformat(f"2026-10-06T{hhmmss}+00:00")


class SessionsTest(unittest.TestCase):
    def test_joins_pieces_of_one_app_across_short_gaps(self):
        sessions = bridge.sessions_from(
            [
                window("10:00:00", 120, "firefox"),
                window("10:02:30", 120, "firefox"),
                window("10:05:00", 300, "code"),
            ],
            [afk("09:00:00", 7200, "not-afk")],
        )
        self.assertEqual(
            sessions,
            [
                bridge.Session("firefox", at("10:00:00"), at("10:04:30")),
                bridge.Session("code", at("10:05:00"), at("10:10:00")),
            ],
        )

    def test_keeps_only_the_time_someone_was_at_the_computer(self):
        sessions = bridge.sessions_from(
            [window("10:00:00", 3600, "firefox")],
            [afk("10:00:00", 600, "not-afk"), afk("10:10:00", 3000, "afk")],
        )
        self.assertEqual(sessions, [bridge.Session("firefox", at("10:00:00"), at("10:10:00"))])

    def test_drops_glances_and_nameless_windows(self):
        sessions = bridge.sessions_from(
            [window("10:00:00", 20, "firefox"), window("10:01:00", 600, "")],
            [afk("09:00:00", 7200, "not-afk")],
        )
        self.assertEqual(sessions, [])

    def test_sends_app_names_and_times_never_titles(self):
        config = {"deviceId": "d1", "deviceName": "laptop"}
        payload = bridge.payload_of(
            config,
            bridge.sessions_from([window("10:00:00", 120, "code")], [afk("09:00:00", 7200, "not-afk")]),
        )
        self.assertEqual(
            payload,
            {
                "deviceId": "d1",
                "deviceName": "laptop",
                "sessions": [
                    {"app": "code", "endAt": "2026-10-06T10:02:00.000Z", "startAt": "2026-10-06T10:00:00.000Z"}
                ],
            },
        )
        self.assertNotIn("secret", str(payload))

    def test_reads_timestamps_with_or_without_a_zone(self):
        self.assertEqual(bridge.parse_time("2026-10-06T10:00:00.5+03:00"), datetime(2026, 10, 6, 7, 0, 0, 500000, tzinfo=timezone.utc))
        self.assertEqual(bridge.iso(bridge.parse_time("2026-10-06T10:00:00")), "2026-10-06T10:00:00.000Z")


class UnitsTest(unittest.TestCase):
    def test_runs_the_script_every_five_minutes_with_this_python(self):
        from pathlib import Path

        service, timer = bridge.units(Path("/home/me/.local/share/pace/pace_aw_bridge.py")).values()
        self.assertIn("pace_aw_bridge.py run", service)
        self.assertIn("Type=oneshot", service)
        self.assertIn("OnUnitActiveSec=5min", timer)


if __name__ == "__main__":
    unittest.main()
