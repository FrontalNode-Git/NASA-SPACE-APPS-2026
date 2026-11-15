"""Crew state and dashboards: joins readings, the baseline engine and crew logs.

Readings come from two places. The simulator supplies a value for every day; whatever a
crew member enters in their daily check-in replaces the simulated value for that day.
In the API, `latest_source: "sensor"` means the simulated value (the name is kept so the
frontend contract does not change); `"manual"` means the crew member typed it.

Privacy rule (tested): mood and personal notes are visible only to the crew member they
belong to. Anyone else, including the Chief Medical Officer, sees the status level only.
"""
from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass, field

from . import baseline as bl
from . import simulator as sim
from .content import Content, Indicator

WINDOW_DAYS = 21  # readings shown on a chart
DRIFT_LOOKBACK = 45  # readings fed to the drift detectors
LOG_KINDS = {"mood", "entry", "ok", "note"}

# What a check-in field can physically hold (a percentage, a five-point scale, hours in a
# day). These only catch typing mistakes. They are not health ranges and are never shown.
INPUT_LIMITS = {"spo2": (0.0, 100.0), "mood": (1.0, 5.0), "sleep_hours": (0.0, 24.0), "exercise_minutes": (0.0, 1440.0)}
# For a field with no natural ceiling. A number this large is a slip of the keyboard in any
# unit, and refusing it keeps the baseline arithmetic finite.
MAX_MAGNITUDE = 1_000_000.0

# Simulated morning check-ins: (days before the viewed day, mission clock).
SIM_CHECKINS = {"commander": (0, "07:10"), "cmo": (0, "06:55"), "systems": (1, "22:40"), "engineer": (0, "07:25")}
SIM_NOTES = {
    "commander": "Simulated note: good session on the bike, feeling steady.",
    "cmo": "Simulated note: skipped the temperature reading this morning.",
    "systems": "Simulated note: late shift on the water loop, short night.",
    "engineer": "Simulated note: busy week, a little wound up before sleep.",
}


class UnknownMember(KeyError):
    pass


@dataclass
class Store:
    """In-memory crew state. Resets with the process; the demo needs nothing durable."""

    logs: dict[str, list[dict[str, object]]] = field(default_factory=dict)
    calibration: dict[str, dict[str, list[float | None]]] = field(default_factory=dict)
    readings: dict[str, dict[str, dict[int, float]]] = field(default_factory=dict)  # member -> indicator -> day
    notices: list[dict[str, object]] = field(default_factory=list)  # crew reports sent to the Commander
    _next_id: int = 1

    def reset(self) -> None:
        self.logs.clear()
        self.calibration.clear()
        self.readings.clear()
        self.notices.clear()
        self._next_id = 1

    def add_notice(self, notice: dict[str, object]) -> dict[str, object]:
        """Keep one sent crew report per mission day: a newer one replaces the older."""
        self.notices = [n for n in self.notices if n["day"] != notice["day"]]
        notice = {"id": self._next_id, **notice}
        self._next_id += 1
        self.notices.append(notice)
        return notice

    def set_reading(self, member: str, indicator: str, day: int, value: float | None) -> None:
        """Store what the crew member entered. None withdraws the entry (the simulated value returns)."""
        days = self.readings.setdefault(member, {}).setdefault(indicator, {})
        if value is None:
            days.pop(day, None)
        else:
            days[day] = value

    def entered(self, member: str, indicator: str) -> dict[int, float]:
        return self.readings.get(member, {}).get(indicator, {})

    def add_log(self, member: str, kind: str, day: int, value: int | None, text: str | None) -> dict[str, object]:
        entry: dict[str, object] = {
            "id": self._next_id,
            "kind": kind,
            "day": day,
            "at": dt.datetime.now().strftime("%H:%M"),
            "value": value,
            "text": text,
            "simulated": False,
        }
        self._next_id += 1
        self.logs.setdefault(member, []).append(entry)
        if kind == "mood" and value is not None:
            self.set_reading(member, "mood", day, float(value))  # a logged mood is today's mood reading
        return entry

    def logs_for(self, member: str, day: int) -> list[dict[str, object]]:
        """Real logs up to `day`, newest first, plus the member's simulated note."""
        real = [e for e in self.logs.get(member, []) if int(e["day"]) <= day]  # type: ignore[call-overload]
        note = {
            "id": 0,
            "kind": "note",
            "day": max(1, day - 1),
            "at": "21:30",
            "value": None,
            "text": SIM_NOTES[member],
            "simulated": True,
        }
        return sorted(real, key=lambda e: (e["day"], e["id"]), reverse=True) + ([note] if day >= 1 else [])


def _member(content: Content, member_id: str) -> dict[str, str]:
    for m in content.model.crew:
        if m.id == member_id:
            return m.model_dump()
    raise UnknownMember(member_id)


def preflight_values(store: Store, member: str, indicator: str, seed: str) -> tuple[list[float | None], bool]:
    """The seven pre-flight readings and whether the member entered them in the wizard."""
    custom = store.calibration.get(member, {}).get(indicator)
    if custom is not None:
        return list(custom), True
    return sim.preflight(member, indicator, seed), False


def indicator_view(content: Content, store: Store, member: str, ind: Indicator, day: int, seed: str) -> dict[str, object]:
    pre, calibrated = preflight_values(store, member, ind.id, seed)
    base = bl.compute_baseline(pre, ind.resolution)
    first = max(1, day - DRIFT_LOOKBACK + 1)
    values = sim.readings(member, ind.id, seed, first, day) if day >= 1 else []
    entered = store.entered(member, ind.id)
    for entered_day, value in entered.items():
        if first <= entered_day <= day:
            values[entered_day - first] = value  # the check-in wins over the simulated value
    latest_source = None
    if values and values[-1] is not None:
        latest_source = "manual" if day in entered else "sensor"

    view: dict[str, object] = {
        "id": ind.id,
        "name": ind.name,
        "unit": ind.unit,
        "decimals": ind.decimals,
        "private": ind.private,
        "locked": False,
        "calibrated_by_member": calibrated,
        "preflight": pre,
        "latest_source": latest_source,
    }
    present = [v for v in values if v is not None]
    missing_days = [first + i for i, v in enumerate(values) if v is None]
    view["confidence"] = {
        "baseline_readings": base.n if base else len([v for v in pre if v is not None]),
        "mission_readings": len(present),
        "missing_today": bool(values) and values[-1] is None,
        "missing_days": [d for d in missing_days if d > day - WINDOW_DAYS],
    }
    if base is None:
        view.update(
            baseline=None, latest=None, z=None, status=bl.NOMINAL, series=[],
            drift={"flag": False, "direction": None, "days": 0, "method": "ewma"},
            cusum={"flag": False, "direction": None, "days": 0},
        )
        return view

    points = bl.ewma(values, base)
    drift = bl.drift_from_ewma(points)
    _, _, cusum_drift = bl.cusum(values, base)
    latest = values[-1] if values else None
    z = bl.zscore(latest, base)
    shown = range(max(0, len(values) - WINDOW_DAYS), len(values))
    view.update(
        baseline={"mean": round(base.mean, 3), "sd": round(base.sd, 3), "n": base.n},
        latest=latest,
        z=None if z is None else round(z, 2),
        status=bl.classify(z, drift),
        drift={"flag": drift.flag, "direction": drift.direction, "days": drift.days, "method": "ewma"},
        cusum={"flag": cusum_drift.flag, "direction": cusum_drift.direction, "days": cusum_drift.days},
        series=[
            {
                "day": first + i,
                "value": values[i],
                "ewma": round(points[i].value, 3),
                "upper": round(points[i].upper, 3),
                "lower": round(points[i].lower, 3),
            }
            for i in shown
        ],
    )
    return view


def _last_checkin(store: Store, member: str, day: int) -> dict[str, object] | None:
    real = [e for e in store.logs.get(member, []) if int(e["day"]) <= day]  # type: ignore[call-overload]
    if real:
        last = max(real, key=lambda e: (e["day"], e["id"]))
        return {"day": last["day"], "at": last["at"], "simulated": False}
    if day < 1:
        return None
    back, clock = SIM_CHECKINS[member]
    return {"day": max(1, day - back), "at": clock, "simulated": True}


def dashboard(content: Content, store: Store, member_id: str, viewer: str, day: int, seed: str) -> dict[str, object]:
    member = _member(content, member_id)
    _member(content, viewer)
    own = viewer == member_id
    indicators = []
    for ind in content.model.indicators:
        view = indicator_view(content, store, member_id, ind, day, seed)
        if ind.private and not own:
            # Status level only: no values, no baseline, no series.
            view = {
                "id": ind.id, "name": ind.name, "unit": ind.unit, "decimals": ind.decimals,
                "private": True, "locked": True, "status": view["status"],
            }
        indicators.append(view)
    phase = content.phase_for_day(day)
    logs = store.logs_for(member_id, day) if own else []
    return {
        "member": member,
        "viewer": viewer,
        "own": own,
        "day": day,
        "seed": seed,
        "phase": {"id": phase.id, "name": phase.name, "environment": phase.environment},
        "simulated": True,
        "method_status": content.model.method_status,
        "overall": bl.worst([str(v["status"]) for v in indicators]),
        "acknowledged": any(e["kind"] == "ok" and e["day"] == day for e in store.logs.get(member_id, [])),
        "last_checkin": _last_checkin(store, member_id, day),
        "indicators": indicators,
        "logs": logs,
        "logs_locked": not own,
    }


def crew(content: Content, store: Store, viewer: str, day: int, seed: str) -> list[dict[str, object]]:
    """Crew tiles: status level per member, most urgent first. Never carries private data."""
    tiles = []
    for order, m in enumerate(content.model.crew):
        dash = dashboard(content, store, m.id, viewer, day, seed)
        statuses = [str(i["status"]) for i in dash["indicators"]]  # type: ignore[union-attr]
        tiles.append(
            {
                "id": m.id,
                "name": m.name,
                "role": m.role,
                "is_self": m.id == viewer,
                "overall": dash["overall"],
                "needs_attention": dash["overall"] != bl.NOMINAL,
                "acknowledged": dash["acknowledged"],
                "watch": statuses.count(bl.WATCH),
                "call_ground": statuses.count(bl.CALL),
                "last_checkin": dash["last_checkin"],
                "_order": order,
            }
        )
    tiles.sort(key=lambda t: (-bl.SEVERITY[str(t["overall"])], t["_order"]))
    for t in tiles:
        del t["_order"]
    return tiles


def entered_value(ind: Indicator, value: float) -> float:
    """One number a crew member typed, checked and rounded to what the indicator can show.

    Used for check-ins and for the calibration week alike. Raises ValueError with a message
    the crew member can read.
    """
    number = float(value)
    low, high = INPUT_LIMITS.get(ind.id, (0.0, MAX_MAGNITUDE))
    if not math.isfinite(number) or not low <= number <= high or (ind.id not in INPUT_LIMITS and number == 0):
        raise ValueError(f"{ind.name}: that value cannot be right, please check it")
    return round(number, ind.decimals)


def save_readings(content: Content, store: Store, member_id: str, day: int, values: dict[str, float | None]) -> None:
    """A daily check-in: the crew member's own readings for one mission day. All or nothing."""
    _member(content, member_id)
    if day < 1:
        raise ValueError("readings start on mission day one")
    clean: dict[str, float | None] = {}
    for indicator_id, value in values.items():
        ind = content.indicator_by_id.get(indicator_id)
        if ind is None:
            raise ValueError(f"unknown indicator {indicator_id!r}")
        clean[indicator_id] = None if value is None else entered_value(ind, value)
    for indicator_id, value in clean.items():
        store.set_reading(member_id, indicator_id, day, value)


def simulated_calibration(content: Content, member_id: str, seed: str) -> dict[str, list[float | None]]:
    _member(content, member_id)
    return {i.id: sim.preflight(member_id, i.id, seed) for i in content.model.indicators}


def save_calibration(content: Content, store: Store, member_id: str, values: dict[str, list[float | None]]) -> None:
    _member(content, member_id)
    clean: dict[str, list[float | None]] = {}
    for ind in content.model.indicators:
        days = values.get(ind.id)
        if days is None:
            continue
        if len(days) != sim.PREFLIGHT_DAYS:
            raise ValueError(f"{ind.id}: expected {sim.PREFLIGHT_DAYS} pre-flight days")
        if len([v for v in days if v is not None]) < bl.MIN_BASELINE_READINGS:
            raise ValueError(f"{ind.id}: need at least {bl.MIN_BASELINE_READINGS} readings")
        clean[ind.id] = [None if v is None else entered_value(ind, v) for v in days]
    store.calibration[member_id] = clean
