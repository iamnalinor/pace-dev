"""Derives the v2 "Lines" palette draft and checks its contrast (WCAG 2.x and APCA 0.0.98G).

Run: python3 context/design/tokens/palette.py
Writes palette-v2-lines.json and palette-v2-lines-contrast.txt next to this file. Design
evidence for the redesign spec, not product code: Phase 4 moves the chosen values into
packages/core/src/design/tokens.json, where a unit test enforces the same pairs.
"""

import json
import math
from pathlib import Path

HERE = Path(__file__).parent

# OKLCH hue angles of the hue family, spaced so neighbours stay apart in both themes.
HUES = {
    "red": 27,
    "orange": 52,
    "amber": 78,
    "yellow": 100,
    "lime": 128,
    "green": 152,
    "teal": 182,
    "cyan": 212,
    "blue": 250,
    "indigo": 276,
    "violet": 302,
    "pink": 345,
}
SLATE_HUE = 255


def _lms(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    a = chroma * math.cos(math.radians(hue))
    b = chroma * math.sin(math.radians(hue))
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    return l_**3, m_**3, s_**3


def _linear_rgb(
    lightness: float, chroma: float, hue: float
) -> tuple[float, float, float]:
    l, m, s = _lms(lightness, chroma, hue)
    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def _encode(value: float) -> int:
    value = max(0.0, min(1.0, value))
    srgb = 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(srgb * 255)


def oklch(lightness: float, chroma: float, hue: float) -> tuple[int, int, int]:
    """The sRGB colour for an OKLCH value, chroma reduced until it fits the gamut."""
    while chroma > 0 and not all(
        -0.001 <= c <= 1.001 for c in _linear_rgb(lightness, chroma, hue)
    ):
        chroma -= 0.002
    r, g, b = _linear_rgb(lightness, chroma, hue)
    return _encode(r), _encode(g), _encode(b)


def to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def from_hex(text: str) -> tuple[int, int, int]:
    text = text.lstrip("#")
    return int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16)


def over(
    top: tuple[int, int, int], bottom: tuple[int, int, int], alpha: float
) -> tuple[int, int, int]:
    r, g, b = (
        round(t * alpha + u * (1 - alpha)) for t, u in zip(top, bottom, strict=True)
    )
    return r, g, b


def wcag(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    def lum(rgb: tuple[int, int, int]) -> float:
        def chan(v: int) -> float:
            x = v / 255
            return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4

        r, g, bl = (chan(v) for v in rgb)
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl

    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def apca(text: tuple[int, int, int], ground: tuple[int, int, int]) -> float:
    def y(rgb: tuple[int, int, int]) -> float:
        r, g, b = ((v / 255) ** 2.4 for v in rgb)
        lum = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
        return lum if lum > 0.022 else lum + (0.022 - lum) ** 1.414

    yt, yb = y(text), y(ground)
    if abs(yb - yt) < 0.0005:
        return 0.0
    if yb > yt:
        s = (yb**0.56 - yt**0.57) * 1.14
        return 0.0 if s < 0.1 else round((s - 0.027) * 100, 1)
    s = (yb**0.65 - yt**0.62) * 1.14
    return 0.0 if s > -0.1 else round((s + 0.027) * 100, 1)


def hue_family(theme: str) -> dict[str, dict[str, str]]:
    family: dict[str, dict[str, str]] = {}
    for name, angle in [*HUES.items(), ("slate", SLATE_HUE)]:
        grey = name == "slate"
        if theme == "light":
            stroke = oklch(0.58 if grey else 0.60, 0.025 if grey else 0.16, angle)
            ink = oklch(0.46 if grey else 0.47, 0.025 if grey else 0.13, angle)
            alpha = 0.12
        else:
            stroke = oklch(0.70 if grey else 0.72, 0.025 if grey else 0.15, angle)
            ink = oklch(0.82 if grey else 0.84, 0.02 if grey else 0.11, angle)
            alpha = 0.18
        family[name] = {
            "stroke": to_hex(stroke),
            "ink": to_hex(ink),
            "tint": f"rgba({stroke[0]}, {stroke[1]}, {stroke[2]}, {alpha})",
        }
    return family


LIGHT = {
    "bg": {
        "app": "#F2F2EF",
        "cell": "#FFFFFF",
        "elevated": "#FFFFFF",
        "sidebar": "#E9ECE7",
        "inset": "#F7F7F5",
    },
    "label": {
        "primary": "#151715",
        "secondary": "#4A4D48",
        "tertiary": "#686B65",
        "quaternary": "#9EA19A",
    },
    "outline": "#8A8D86",
    "accent": {
        "default": "#0E7A45",
        "on": "#FFFFFF",
        "text": "#0B6B3C",
        "pressed": "#0A6539",
    },
    "status": {
        "danger": "#B42318",
        "warn": "#9A5200",
        "question": "#795300",
        "success": "#0B6B3C",
    },
    "focus": "#0E7A45",
}
DARK = {
    "bg": {
        "app": "#101111",
        "cell": "#1A1B1B",
        "elevated": "#242625",
        "sidebar": "#0C0D0D",
        "inset": "#151616",
    },
    "label": {
        "primary": "#EDEDEA",
        "secondary": "#C8C9C4",
        "tertiary": "#A4A5A0",
        "quaternary": "#62635F",
    },
    "outline": "#7A7C77",
    "accent": {
        "default": "#45C680",
        "on": "#04140B",
        "text": "#5DD192",
        "pressed": "#3AAE6F",
    },
    "status": {
        "danger": "#FF7B6B",
        "warn": "#F2A14A",
        "question": "#F2C275",
        "success": "#5DD192",
    },
    "focus": "#5DD192",
}
TRANSLUCENT = {
    "light": {
        "fill": {
            "1": "rgba(21, 23, 21, 0.04)",
            "2": "rgba(21, 23, 21, 0.07)",
            "3": "rgba(21, 23, 21, 0.11)",
            "4": "rgba(21, 23, 21, 0.16)",
        },
        "separator": {"default": "rgba(21, 23, 21, 0.10)", "opaque": "#DCDDD8"},
        "accentQuiet": "rgba(14, 122, 69, 0.12)",
        "dangerQuiet": "rgba(180, 35, 24, 0.10)",
        "warnQuiet": "rgba(212, 120, 0, 0.13)",
        "selection": "rgba(14, 122, 69, 0.18)",
        "scrim": "rgba(10, 12, 10, 0.32)",
        "shadow": {
            "card": "0 1px 2px rgba(10, 12, 10, 0.05)",
            "overlay": "0 12px 32px rgba(10, 12, 10, 0.14), 0 2px 6px rgba(10, 12, 10, 0.06)",
        },
    },
    "dark": {
        "fill": {
            "1": "rgba(237, 237, 234, 0.05)",
            "2": "rgba(237, 237, 234, 0.08)",
            "3": "rgba(237, 237, 234, 0.12)",
            "4": "rgba(237, 237, 234, 0.18)",
        },
        "separator": {"default": "rgba(237, 237, 234, 0.10)", "opaque": "#2E302F"},
        "accentQuiet": "rgba(69, 198, 128, 0.16)",
        "dangerQuiet": "rgba(255, 123, 107, 0.15)",
        "warnQuiet": "rgba(242, 161, 74, 0.16)",
        "selection": "rgba(69, 198, 128, 0.26)",
        "scrim": "rgba(0, 0, 0, 0.55)",
        "shadow": {
            "card": "none",
            "overlay": "0 0 0 1px rgba(237, 237, 234, 0.08), 0 16px 40px rgba(0, 0, 0, 0.5)",
        },
    },
}


def check(theme: str, t: dict) -> list[str]:
    cell, app, elevated = (from_hex(t["bg"][k]) for k in ("cell", "app", "elevated"))
    rows: list[tuple[str, float, float]] = []
    for level in ("primary", "secondary", "tertiary"):
        for ground_name, ground in (
            ("cell", cell),
            ("app", app),
            ("elevated", elevated),
        ):
            colour = from_hex(t["label"][level])
            rows.append(
                (
                    f"label.{level} / bg.{ground_name}",
                    wcag(colour, ground),
                    apca(colour, ground),
                )
            )
    pairs = [
        ("accent.text / bg.cell", t["accent"]["text"], t["bg"]["cell"]),
        ("accent.on / accent", t["accent"]["on"], t["accent"]["default"]),
        ("outline / bg.cell (UI 3:1)", t["outline"], t["bg"]["cell"]),
        ("outline / bg.app (UI 3:1)", t["outline"], t["bg"]["app"]),
        ("focus / bg.cell (UI 3:1)", t["focus"], t["bg"]["cell"]),
        ("focus / bg.app (UI 3:1)", t["focus"], t["bg"]["app"]),
        ("status.danger / bg.cell", t["status"]["danger"], t["bg"]["cell"]),
        ("status.warn / bg.cell", t["status"]["warn"], t["bg"]["cell"]),
        ("status.danger / bg.app", t["status"]["danger"], t["bg"]["app"]),
    ]
    rows += [
        (name, wcag(from_hex(a), from_hex(b)), apca(from_hex(a), from_hex(b)))
        for name, a, b in pairs
    ]
    for name, value in t["hue"].items():
        stroke, ink = from_hex(value["stroke"]), from_hex(value["ink"])
        alpha = float(value["tint"].split(",")[-1].rstrip(")"))
        tint = over(stroke, cell, alpha)
        rows.append((f"hue.{name}.ink / tint", wcag(ink, tint), apca(ink, tint)))
        rows.append((f"hue.{name}.stroke / bg.app (UI 3:1)", wcag(stroke, app), 0.0))
    return [theme] + [f"  {n:38} {r:5.2f}  Lc {lc}" for n, r, lc in rows]


# Direction A · Тетрадь (the owner's choice, 2026-11-01): cool paper, ink-blue accent, red margin
# as status only, the bright lime logo (owner, round 2).
NOTEBOOK_LIGHT = {
    "bg": {
        "app": "#F4F5F9",
        "cell": "#FFFFFF",
        "elevated": "#FFFFFF",
        "sidebar": "#ECEEF4",
        "inset": "#F8F9FC",
    },
    "label": {
        "primary": "#12141C",
        "secondary": "#474C60",
        "tertiary": "#646A80",
        "quaternary": "#B4B8C7",
    },
    "outline": "#878CA0",
    "accent": {
        "default": "#2E4AD6",
        "on": "#FFFFFF",
        "text": "#2E4AD6",
        "pressed": "#2640BC",
    },
    "status": {
        "danger": "#C3352B",
        "warn": "#B04A0C",
        "question": "#795300",
        "success": "#2E4AD6",
    },
    "focus": "#2E4AD6",
    "logo": "#5E8C00",
}
NOTEBOOK_DARK = {
    "bg": {
        "app": "#0D0F15",
        "cell": "#161922",
        "elevated": "#1F2333",
        "sidebar": "#0A0C11",
        "inset": "#12141B",
    },
    "label": {
        "primary": "#ECEEF4",
        "secondary": "#C3C7D5",
        "tertiary": "#A0A5B9",
        "quaternary": "#4A4F63",
    },
    "outline": "#767C93",
    "accent": {
        "default": "#97A9FF",
        "on": "#0B0D14",
        "text": "#ACBAFF",
        "pressed": "#8498F7",
    },
    "status": {
        "danger": "#FF8274",
        "warn": "#FFA870",
        "question": "#F2C275",
        "success": "#ACBAFF",
    },
    "focus": "#ACBAFF",
    "logo": "#C8F03C",
}
NOTEBOOK_TRANSLUCENT = {
    "light": {
        "fill": {
            "1": "rgba(20, 28, 70, 0.04)",
            "2": "rgba(20, 28, 70, 0.07)",
            "3": "rgba(20, 28, 70, 0.11)",
            "4": "rgba(20, 28, 70, 0.16)",
        },
        "separator": {"default": "rgba(20, 28, 70, 0.10)", "opaque": "#DFE1E9"},
        "accentQuiet": "rgba(46, 74, 214, 0.10)",
        "dangerQuiet": "rgba(195, 53, 43, 0.10)",
        "warnQuiet": "rgba(214, 110, 20, 0.13)",
        "selection": "rgba(46, 74, 214, 0.18)",
        "grid": "rgba(46, 74, 214, 0.07)",
        "scrim": "rgba(10, 12, 24, 0.32)",
        "shadow": {
            "card": "0 1px 2px rgba(20, 28, 70, 0.05)",
            "overlay": "0 12px 32px rgba(20, 28, 70, 0.14), 0 2px 6px rgba(20, 28, 70, 0.06)",
        },
    },
    "dark": {
        "fill": {
            "1": "rgba(190, 200, 255, 0.05)",
            "2": "rgba(190, 200, 255, 0.08)",
            "3": "rgba(190, 200, 255, 0.12)",
            "4": "rgba(190, 200, 255, 0.18)",
        },
        "separator": {"default": "rgba(190, 200, 255, 0.10)", "opaque": "#262A37"},
        "accentQuiet": "rgba(151, 169, 255, 0.16)",
        "dangerQuiet": "rgba(255, 130, 116, 0.15)",
        "warnQuiet": "rgba(255, 155, 94, 0.16)",
        "selection": "rgba(151, 169, 255, 0.26)",
        "grid": "rgba(150, 170, 255, 0.06)",
        "scrim": "rgba(0, 0, 0, 0.55)",
        "shadow": {
            "card": "none",
            "overlay": "0 0 0 1px rgba(190, 200, 255, 0.08), 0 16px 40px rgba(0, 0, 0, 0.5)",
        },
    },
}


def write(name: str, light: dict, dark: dict) -> list[str]:
    (HERE / f"palette-v2-{name}.json").write_text(
        json.dumps({"light": light, "dark": dark}, indent=2) + "\n"
    )
    report = check("light", light) + check("dark", dark)
    (HERE / f"palette-v2-{name}-contrast.txt").write_text("\n".join(report) + "\n")
    return report


def main() -> None:
    write(
        "lines",
        {**LIGHT, **TRANSLUCENT["light"], "hue": hue_family("light")},
        {**DARK, **TRANSLUCENT["dark"], "hue": hue_family("dark")},
    )
    report = write(
        "notebook",
        {**NOTEBOOK_LIGHT, **NOTEBOOK_TRANSLUCENT["light"], "hue": hue_family("light")},
        {**NOTEBOOK_DARK, **NOTEBOOK_TRANSLUCENT["dark"], "hue": hue_family("dark")},
    )
    print("\n".join(report))


if __name__ == "__main__":
    main()
