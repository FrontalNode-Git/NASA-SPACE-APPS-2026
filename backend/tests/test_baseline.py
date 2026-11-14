import math

import pytest

from app import baseline as bl
from app import simulator as sim


def test_baseline_mean_sd_and_count():
    base = bl.compute_baseline([60, 62, None, 58, 61, 59, 60])
    assert base.n == 6
    assert base.mean == pytest.approx(60.0)
    assert base.sd == pytest.approx(math.sqrt(10 / 5))


def test_baseline_needs_enough_readings_and_floors_a_flat_week():
    assert bl.compute_baseline([60, None, 61]) is None
    assert bl.compute_baseline([4, 4, 4, 4], resolution=0.5).sd == 0.5


def test_zscore():
    base = bl.Baseline(mean=60, sd=2, n=7)
    assert bl.zscore(64, base) == pytest.approx(2.0)
    assert bl.zscore(None, base) is None


def test_ewma_recursion_and_limits_match_the_formula():
    base = bl.Baseline(mean=10, sd=2, n=7)
    pts = bl.ewma([12, 12], base, lam=0.2, width=3)
    assert pts[0].value == pytest.approx(10.4)  # 0.2*12 + 0.8*10
    assert pts[1].value == pytest.approx(10.72)
    half1 = 3 * 2 * math.sqrt(0.2 / 1.8 * (1 - 0.8**2))
    assert pts[0].upper == pytest.approx(10 + half1)
    assert pts[0].lower == pytest.approx(10 - half1)
    steady = 3 * 2 * math.sqrt(0.2 / 1.8)
    assert bl.ewma([10] * 200, base, lam=0.2, width=3)[-1].upper == pytest.approx(10 + steady)


def test_ewma_holds_through_a_missing_reading():
    base = bl.Baseline(mean=10, sd=2, n=7)
    pts = bl.ewma([12, None, 12], base)
    assert pts[1].value == pts[0].value
    assert pts[1].upper == pts[0].upper


def test_ewma_catches_a_slow_drift_that_single_readings_miss():
    base = bl.Baseline(mean=60, sd=2, n=7)
    values = [60 + min(2.6, 0.26 * i) for i in range(1, 21)]  # creeps up 1.3 SD, then holds
    assert all(abs(bl.zscore(v, base)) < bl.WATCH_Z for v in values)
    drift = bl.drift_from_ewma(bl.ewma(values, base))
    assert drift.flag and drift.direction == "above" and drift.days >= 5
    assert bl.classify(bl.zscore(values[-1], base), drift) == bl.WATCH


def test_no_drift_on_a_steady_series_and_downward_drift_is_named():
    base = bl.Baseline(mean=60, sd=2, n=7)
    assert bl.drift_from_ewma(bl.ewma([60, 61, 59, 60, 61, 59] * 5, base)) == bl.Drift(False, None, 0)
    down = bl.drift_from_ewma(bl.ewma([57] * 10, base))
    assert down.flag and down.direction == "below"


def test_cusum_accumulates_and_flags():
    base = bl.Baseline(mean=0, sd=1, n=7)
    highs, lows, drift = bl.cusum([1.5] * 5, base, k=0.5, h=4)
    assert highs == pytest.approx([1, 2, 3, 4, 5])
    assert lows == [0] * 5
    assert drift == bl.Drift(True, "above", 1)
    _, lows, drift = bl.cusum([-1.5] * 6, base)
    assert drift.flag and drift.direction == "below" and drift.days == 2
    assert not bl.cusum([0.2, -0.3, 0.1, 0.0], base)[2].flag


def test_classify_thresholds():
    none = bl.Drift(False, None, 0)
    assert bl.classify(1.99, none) == bl.NOMINAL
    assert bl.classify(-2.0, none) == bl.WATCH
    assert bl.classify(3.0, none) == bl.CALL
    assert bl.classify(None, none) == bl.NOMINAL
    assert bl.classify(0.1, bl.Drift(True, "above", 3)) == bl.WATCH
    assert bl.worst([bl.NOMINAL, bl.CALL, bl.WATCH]) == bl.CALL


def test_simulator_is_deterministic_and_respects_limits():
    a = sim.readings("engineer", "heart_rate", "demo", -7, 40)
    assert a == sim.readings("engineer", "heart_rate", "demo", -7, 40)
    assert a != sim.readings("engineer", "heart_rate", "nominal", -7, 40)
    assert all(v is None or 1 <= v <= 5 for v in sim.readings("cmo", "mood", "demo", -7, 400))
    assert all(v is None or v <= 100 for v in sim.readings("cmo", "spo2", "demo", -7, 400))
    assert sim.reading("engineer", "heart_rate", "demo", 0) is None


def test_demo_story_is_locked(client):
    """The presenter script depends on these exact outcomes."""

    def statuses(member, day):
        dash = client.get(f"/api/v1/members/{member}/dashboard", params={"viewer": member, "day": day}).json()
        return dash, {i["id"]: i["status"] for i in dash["indicators"] if i["status"] != "nominal"}

    for member in sim.PROFILES:
        assert statuses(member, 8)[1] == {}, "day 8 is the quiet day"

    dash, flagged = statuses("engineer", sim.DEMO_DAY)
    assert flagged == {"heart_rate": "watch"}
    hr = next(i for i in dash["indicators"] if i["id"] == "heart_rate")
    assert hr["drift"] == {"flag": True, "direction": "above", "days": 5, "method": "ewma"}
    assert abs(hr["z"]) < bl.WATCH_Z, "no single reading would have raised it"
    assert all(abs((p["value"] - hr["baseline"]["mean"]) / hr["baseline"]["sd"]) < bl.WATCH_Z for p in hr["series"])
    assert hr["cusum"]["flag"], "CUSUM agrees with EWMA"

    assert statuses("systems", sim.DEMO_DAY)[1] == {"sleep_hours": "call_ground"}
    assert statuses("commander", sim.DEMO_DAY)[1] == {}
    cmo, flagged = statuses("cmo", sim.DEMO_DAY)
    assert flagged == {}
    temp = next(i for i in cmo["indicators"] if i["id"] == "temperature")
    assert temp["confidence"]["missing_today"] and temp["latest"] is None


def test_other_scenarios_are_locked(client):
    """The judge drawer's scenario picker promises these outcomes on the demo day."""

    def flagged(seed):
        out = {}
        for member in sim.PROFILES:
            dash = client.get(
                f"/api/v1/members/{member}/dashboard",
                params={"viewer": member, "day": sim.DEMO_DAY, "seed": seed},
            ).json()
            out.update({(member, i["id"]): i["status"] for i in dash["indicators"] if i["status"] != "nominal"})
        return out

    assert flagged("nominal") == {}
    assert flagged("acute") == {("engineer", "temperature"): "call_ground"}


def test_simulated_numbers_are_identical_on_every_machine():
    """The scenarios are scripted on exact values, so the generator must not vary by platform."""
    draws = sim._normals(4, "vita-l", "portability")
    assert draws == pytest.approx([1.310959238727, 0.884992510026, 0.624082336297, -1.041636336054], abs=1e-9)
    assert sim.readings("engineer", "heart_rate", "demo", -7, 0) == [62.0, 61.0, 60.0, 55.0, 57.0, 59.0, 57.0, None]
    assert sim.readings("engineer", "heart_rate", "demo", 14, 20) == [62.0, 62.0, 62.0, 63.0, 62.0, 63.0, 63.0]
