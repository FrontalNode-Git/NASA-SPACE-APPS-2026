"""Runtime configuration and feature flags.

Optional modules are OFF by default. They are scaffolds only: no data, no numbers.
Do not switch one on until the team has said "approve live data".

Settings come from environment variables. For local work, copy backend/.env.example to
backend/.env; real environment variables always win over that file.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


def _load_env_file(path: Path) -> None:
    """Tiny .env reader: KEY=VALUE per line, '#' starts a comment. No new dependency."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file(BACKEND_DIR / ".env")

# Content (data/) and the built frontend sit beside backend/ in the repo.
DATA_DIR = Path(os.getenv("VITAL_DATA_DIR", str(REPO_ROOT / "data")))
FRONTEND_DIST = Path(os.getenv("VITAL_FRONTEND_DIST", str(REPO_ROOT / "frontend" / "dist")))

# flag name -> (title, what it would add once approved)
OPTIONAL_MODULES: dict[str, tuple[str, str]] = {
    "LIVE_SPACE_WEATHER": (
        "Live space weather",
        "NASA DONKI / NOAA GOES feeds alongside the Radiation hazard.",
    ),
    "DISTANCE_ENGINE": (
        "Distance engine",
        "Orbital geometry and communication-delay maths for the mission timeline.",
    ),
    "TRIAGE_PROTOCOLS": (
        "Triage protocols",
        "Step-by-step procedures once approved medical content exists.",
    ),
    "ECLSS_MODELS": (
        "ECLSS models",
        "Cabin environment models for the Hostile/Closed Environments hazard.",
    ),
}


def flag(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() in {"1", "true", "yes", "on"}


def flags() -> list[dict[str, object]]:
    """Current state of every optional module, read from the environment at call time."""
    return [
        {"id": name, "enabled": flag(name), "title": title, "summary": summary}
        for name, (title, summary) in OPTIONAL_MODULES.items()
    ]
