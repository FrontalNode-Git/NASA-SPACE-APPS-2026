"""Deterministic simulated readings for the fictional crew.

Every value produced here is SIMULATED. The personal means below are made-up starting
points for four fictional people; they are not reference ranges and are never shown as
"normal for humans". The same (member, indicator, seed) always yields the same series.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from functools import lru_cache

PREFLIGHT_DAYS = 7
FIRST_DAY = -PREFLIGHT_DAYS
MAX_DAY = 1095
DEMO_DAY = 20

# member -> indicator -> (personal mean, day-to-day SD). Fictional.
PROFILES: dict[str, dict[str, tuple[float, float]]] = {
    "commander": {
        "heart_rate": (56.0, 2.2), "spo2": (97.6, 0.6), "temperature": (36.6, 0.14),
        "sleep_hours": (7.1, 0.45), "exercise_minutes": (118.0, 11.0), "mood": (4.2, 0.55),
    },
    "cmo": {
        "heart_rate": (62.0, 2.6), "spo2": (98.0, 0.6), "temperature": (36.7, 0.15),
        "sleep_hours": (6.8, 0.5), "exercise_minutes": (105.0, 12.0), "mood": (4.0, 0.6),
    },
    "systems": {
        "heart_rate": (66.0, 2.8), "spo2": (97.2, 0.7), "temperature": (36.5, 0.13),
        "sleep_hours": (7.4, 0.5), "exercise_minutes": (96.0, 13.0), "mood": (3.8, 0.6),
    },
    "engineer": {
        "heart_rate": (59.0, 2.4), "spo2": (97.8, 0.6), "temperature": (36.8, 0.14),
        "sleep_hours": (7.0, 0.5), "exercise_minutes": (124.0, 12.0), "mood": (4.1, 0.55),
    },
}
DECIMALS = {"heart_rate": 0, "spo2": 0, "temperature": 1, "sleep_hours": 1, "exercise_minutes": 0, "mood": 0}
LIMITS = {"spo2": (0.0, 100.0), "mood": (1.0, 5.0), "sleep_hours": (0.0, 24.0), "exercise_minutes": (0.0, 600.0)}


@dataclass(frozen=True)
class Ramp:
    """Slow drift in personal-SD units: rise from `start` to `peak`, hold, fade out by `end`."""

    start: int
    peak: int
    hold_until: int
    end: int
    size: float

    def at(self, day: int) -> float:
        if day <= self.start or day >= self.end:
            return 0.0
        if day < self.peak:
            return self.size * (day - self.start) / (self.peak - self.start)
        if day <= self.hold_until:
            return self.size
        return self.size * (self.end - day) / (self.end - self.hold_until)


@dataclass(frozen=True)
class Spike:
    """A far-out reading on given days: exactly `size` personal SDs from the mean."""

    days: tuple[int, ...]
    size: float


@dataclass(frozen=True)
class Scenario:
    label: str
    effects: dict[tuple[str, str], tuple[Ramp | Spike, ...]]
    missing: dict[tuple[str, str], tuple[int, ...]]
    noise: dict[tuple[str, str], float]  # optional mission-noise scale for a clean demo
    salt: str = ""  # picks the random stream; chosen so the scripted story has no stray alerts


SCENARIOS: dict[str, Scenario] = {
    "demo": Scenario(
        label="Demo story: one slow drift, one far-out reading, one missed reading",
        effects={
            ("engineer", "heart_rate"): (Ramp(start=6, peak=15, hold_until=26, end=34, size=1.3),),
            ("systems", "sleep_hours"): (Spike(days=(DEMO_DAY,), size=-3.6),),
        },
        missing={("cmo", "temperature"): (DEMO_DAY, 9), ("systems", "exercise_minutes"): (12,)},
        salt="s63",
        noise={("engineer", "heart_rate"): 0.3},
    ),
    "nominal": Scenario(
        label="Quiet mission: everyone inside their own normal",
        effects={},
        missing={},
        noise={},
        salt="s80",
    ),
    "acute": Scenario(
        label="Sudden change: a far-out temperature reading for the Flight Engineer",
        effects={("engineer", "temperature"): (Spike(days=(20, 21, 22), size=3.8),)},
        missing={},
        noise={},
        salt="s30",
    ),
}


def _normals(count: int, *parts: str) -> list[float]:
    """`count` standard-normal draws that are identical on every machine and Python version.

    Box-Muller over random.random(), whose sequence for a given seed Python guarantees not
    to change. The scripted scenarios (and their tests) depend on these exact numbers, so
    nothing here may rely on a third-party generator that could differ between installs.
    """
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))
    out: list[float] = []
    while len(out) < count:
        radius = math.sqrt(-2.0 * math.log(1.0 - rng.random()))  # 1 - u is in (0, 1]
        angle = 2.0 * math.pi * rng.random()
        out += [radius * math.cos(angle), radius * math.sin(angle)]
    return out[:count]


@lru_cache(maxsize=256)
def _series(member: str, indicator: str, seed: str) -> tuple[float | None, ...]:
    mean, sd = PROFILES[member][indicator]
    scenario = SCENARIOS[seed]
    key = (member, indicator)
    noise = _normals(MAX_DAY - FIRST_DAY + 1, seed, scenario.salt, member, indicator)
    # Standardise the pre-flight week so the simulated baseline matches the member's profile
    # exactly; otherwise seven random draws give a noticeably different "normal" per seed.
    pre = noise[:PREFLIGHT_DAYS]
    pre_mean = sum(pre) / PREFLIGHT_DAYS
    pre_sd = math.sqrt(sum((x - pre_mean) ** 2 for x in pre) / (PREFLIGHT_DAYS - 1))
    noise[:PREFLIGHT_DAYS] = [(x - pre_mean) / pre_sd for x in pre]
    scale = scenario.noise.get(key, 1.0)
    effects = scenario.effects.get(key, ())
    missing = set(scenario.missing.get(key, ()))
    lo, hi = LIMITS.get(indicator, (float("-inf"), float("inf")))
    out: list[float | None] = []
    for i, day in enumerate(range(FIRST_DAY, MAX_DAY + 1)):
        if day == 0 or day in missing:  # day 0 is launch day: no reading
            out.append(None)
            continue
        wobble = noise[i] * (scale if day > 0 else 1.0)
        for effect in effects:
            if isinstance(effect, Ramp):
                wobble += effect.at(day)
            elif day in effect.days:
                wobble = effect.size
        value = min(hi, max(lo, mean + sd * wobble))
        out.append(round(value, DECIMALS[indicator]))
    return tuple(out)


def reading(member: str, indicator: str, seed: str, day: int) -> float | None:
    return _series(member, indicator, seed)[day - FIRST_DAY]


def readings(member: str, indicator: str, seed: str, first: int, last: int) -> list[float | None]:
    """Readings for days first..last inclusive (pre-flight days are negative)."""
    data = _series(member, indicator, seed)
    return [data[d - FIRST_DAY] for d in range(first, last + 1)]


def preflight(member: str, indicator: str, seed: str) -> list[float | None]:
    return readings(member, indicator, seed, FIRST_DAY, -1)
