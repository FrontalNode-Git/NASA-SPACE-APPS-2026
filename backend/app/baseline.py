"""Personal baseline and drift detection. Pure statistics, no external data, no health claims.

"Your normal" is the mean and standard deviation of a crew member's own pre-flight
readings. Later readings are compared with that personal band, never with a population
range. Two classic control-chart methods catch slow trends a single reading would miss:

* EWMA  - exponentially weighted moving average with exact time-varying limits
* CUSUM - tabular cumulative sum (two one-sided sums)

All thresholds are a provisional method until the science content is approved.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

Reading = float | None

MIN_BASELINE_READINGS = 3
WATCH_Z = 2.0  # single reading this many personal SDs from baseline -> Watch
CALL_Z = 3.0  # single reading this many personal SDs from baseline -> Call ground
EWMA_LAMBDA = 0.2
EWMA_L = 2.7
CUSUM_K = 0.5
CUSUM_H = 4.0

NOMINAL, WATCH, CALL = "nominal", "watch", "call_ground"
SEVERITY = {NOMINAL: 0, WATCH: 1, CALL: 2}


@dataclass(frozen=True)
class Baseline:
    mean: float
    sd: float
    n: int


@dataclass(frozen=True)
class EwmaPoint:
    value: float
    upper: float
    lower: float
    flag: bool
    side: int  # +1 above the upper limit, -1 below the lower limit, 0 inside


@dataclass(frozen=True)
class Drift:
    flag: bool
    direction: str | None  # "above" | "below"
    days: int  # consecutive most-recent readings with the EWMA outside its limits


def compute_baseline(values: Sequence[Reading], resolution: float = 0.0) -> Baseline | None:
    """Mean and sample SD of the available readings; None if there are too few.

    `resolution` is the smallest step the measurement can show. The SD is floored at it so
    a perfectly flat week cannot produce a zero-width "normal" band.
    """
    xs = [float(v) for v in values if v is not None]
    if len(xs) < MIN_BASELINE_READINGS:
        return None
    mean = sum(xs) / len(xs)
    var = sum((x - mean) ** 2 for x in xs) / (len(xs) - 1)
    return Baseline(mean=mean, sd=max(math.sqrt(var), resolution, 1e-9), n=len(xs))


def zscore(value: Reading, baseline: Baseline) -> float | None:
    if value is None:
        return None
    return (float(value) - baseline.mean) / baseline.sd


def ewma(
    values: Sequence[Reading], baseline: Baseline, lam: float = EWMA_LAMBDA, width: float = EWMA_L
) -> list[EwmaPoint]:
    """EWMA chart started at the baseline mean. A missing reading holds the previous value."""
    if not 0 < lam <= 1:
        raise ValueError("lam must be in (0, 1]")
    z = baseline.mean
    t = 0
    out: list[EwmaPoint] = []
    for x in values:
        if x is not None:
            t += 1
            z = lam * float(x) + (1 - lam) * z
        half = width * baseline.sd * math.sqrt(lam / (2 - lam) * (1 - (1 - lam) ** (2 * t)))
        upper, lower = baseline.mean + half, baseline.mean - half
        side = 0 if t == 0 else (1 if z > upper else -1 if z < lower else 0)
        out.append(EwmaPoint(value=z, upper=upper, lower=lower, flag=side != 0, side=side))
    return out


def drift_from_ewma(points: Sequence[EwmaPoint]) -> Drift:
    """Summarise the chart: is the latest point out of limits, which way, and for how long."""
    if not points or not points[-1].flag:
        return Drift(flag=False, direction=None, days=0)
    side = points[-1].side
    days = 0
    for p in reversed(points):
        if p.side != side:
            break
        days += 1
    return Drift(flag=True, direction="above" if side > 0 else "below", days=days)


def cusum(
    values: Sequence[Reading], baseline: Baseline, k: float = CUSUM_K, h: float = CUSUM_H
) -> tuple[list[float], list[float], Drift]:
    """Tabular CUSUM in SD units. Returns the high sums, the low sums and a drift summary."""
    hi = lo = 0.0
    highs: list[float] = []
    lows: list[float] = []
    for x in values:
        if x is not None:
            z = (float(x) - baseline.mean) / baseline.sd
            hi = max(0.0, hi + z - k)
            lo = max(0.0, lo - z - k)
        highs.append(hi)
        lows.append(lo)
    if highs and (highs[-1] > h or lows[-1] > h):
        up = highs[-1] >= lows[-1]
        series = highs if up else lows
        days = 0
        for v in reversed(series):
            if v <= h:
                break
            days += 1
        return highs, lows, Drift(flag=True, direction="above" if up else "below", days=days)
    return highs, lows, Drift(flag=False, direction=None, days=0)


def classify(z: float | None, drift: Drift) -> str:
    """Status for one indicator. Provisional method: statistics only, no medical meaning."""
    if z is not None and abs(z) >= CALL_Z:
        return CALL
    if (z is not None and abs(z) >= WATCH_Z) or drift.flag:
        return WATCH
    return NOMINAL


def worst(statuses: Sequence[str]) -> str:
    return max(statuses, key=lambda s: SEVERITY[s], default=NOMINAL)
