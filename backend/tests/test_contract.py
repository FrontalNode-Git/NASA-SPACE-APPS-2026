"""The API contract the frontend relies on.

These tests pin the shape of every response the UI reads. If one fails because you changed
a response on purpose, update frontend/src/lib/types.ts and docs/API.md in the same change
and tell whoever owns the frontend. That is the whole hand-off between the two halves.
"""
from app import simulator as sim

DAY = sim.DEMO_DAY


def test_config(client):
    cfg = client.get("/api/v1/config").json()
    assert set(cfg) == {"modules", "demo_day", "max_day", "preflight_days", "seeds"}
    assert set(cfg["modules"][0]) == {"id", "enabled", "title", "summary"}
    assert set(cfg["seeds"][0]) == {"id", "label"}
    assert cfg["demo_day"] == DAY and cfg["preflight_days"] == sim.PREFLIGHT_DAYS


def test_content_bundle(client):
    bundle = client.get("/api/v1/content/bundle").json()
    assert set(bundle) == {
        "facts", "hazards", "risks", "research", "method_status", "crew", "indicators", "zones",
        "environments", "mission", "features", "slots", "hazard_links", "pending", "coverage",
    }
    assert {"id", "text", "quote", "url", "page_title", "fetched_at", "links"} <= set(bundle["facts"][0])
    assert set(bundle["facts"][0]["links"]) == {"indicators", "zones", "hazards", "risks"}
    assert set(bundle["hazards"][0]) == {"id", "short", "name", "url", "fact_ids"}
    assert set(bundle["risks"][0]) == {"id", "name", "category", "url", "fact_id", "hazards", "zones"}
    assert set(bundle["indicators"][0]) == {"id", "name", "unit", "decimals", "resolution", "zones", "risks", "private"}
    assert set(bundle["zones"][0]) == {"id", "name", "anchor"}
    assert set(bundle["environments"][0]) == {"id", "name", "fact_ids"}
    assert set(bundle["mission"]) == {"name", "note", "total_days", "basis_fact_ids", "phases"}
    assert set(bundle["mission"]["phases"][0]) == {"id", "name", "start", "end", "environment", "basis_fact_ids"}
    assert set(bundle["features"][0]) == {"id", "name", "kind"}
    assert set(bundle["crew"][0]) == {"id", "name", "role"}
    assert set(bundle["hazard_links"]) == {"risks", "studies", "indicators", "zones", "environments"}
    assert set(bundle["pending"][0]) == {"id", "where", "reason", "resolve"}
    assert set(bundle["coverage"]) == {"total", "monitored", "partial", "pending", "rows"}
    assert set(bundle["coverage"]["rows"][0]) == {"risk_id", "level", "indicators", "cells"}


def test_dashboard(client):
    dash = client.get("/api/v1/members/engineer/dashboard", params={"viewer": "engineer", "day": DAY}).json()
    assert set(dash) == {
        "member", "viewer", "own", "day", "seed", "phase", "simulated", "method_status", "overall",
        "acknowledged", "last_checkin", "indicators", "logs", "logs_locked",
    }
    assert set(dash["phase"]) == {"id", "name", "environment"}
    assert set(dash["last_checkin"]) == {"day", "at", "simulated"}
    indicator = dash["indicators"][0]
    assert set(indicator) == {
        "id", "name", "unit", "decimals", "private", "locked", "calibrated_by_member", "preflight",
        "latest_source", "confidence", "baseline", "latest", "z", "status", "drift", "cusum", "series",
    }
    assert indicator["latest_source"] in {"sensor", "manual", None}
    assert set(indicator["baseline"]) == {"mean", "sd", "n"}
    assert set(indicator["confidence"]) == {"baseline_readings", "mission_readings", "missing_today", "missing_days"}
    assert set(indicator["drift"]) == {"flag", "direction", "days", "method"}
    assert set(indicator["cusum"]) == {"flag", "direction", "days"}
    assert set(indicator["series"][0]) == {"day", "value", "ewma", "upper", "lower"}
    assert set(dash["logs"][0]) == {"id", "kind", "day", "at", "value", "text", "simulated"}
    assert indicator["status"] in {"nominal", "watch", "call_ground"}


def test_crew_tiles(client):
    tiles = client.get("/api/v1/crew", params={"viewer": "cmo", "day": DAY}).json()
    assert set(tiles[0]) == {
        "id", "name", "role", "is_self", "overall", "needs_attention", "acknowledged", "watch",
        "call_ground", "last_checkin",
    }


def test_readings_check_in(client):
    r = client.put("/api/v1/members/engineer/readings", params={"viewer": "engineer"},
                   json={"day": DAY, "values": {"heart_rate": 61, "sleep_hours": 7.5}})
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_log_and_calibration(client):
    entry = client.post("/api/v1/members/engineer/logs", params={"viewer": "engineer"},
                        json={"kind": "entry", "day": DAY, "text": "Exercise done"}).json()
    assert set(entry) == {"id", "kind", "day", "at", "value", "text", "simulated"}
    cal = client.get("/api/v1/members/engineer/calibration").json()
    assert set(cal) == {"simulated", "saved"}
    assert set(cal["simulated"]) == {"heart_rate", "spo2", "temperature", "sleep_hours", "exercise_minutes", "mood"}


def test_report(client):
    report = client.get("/api/v1/members/engineer/report", params={"day": DAY}).json()
    assert set(report) == {
        "title", "simulated", "disclaimer", "method_status", "generated_at", "member", "mission_day",
        "phase", "seed", "overall", "overall_label", "acknowledged", "indicators", "drifts", "missing",
        "notes", "linked_risks", "text",
    }
    assert set(report["indicators"][0]) == {
        "id", "name", "unit", "status", "status_label", "latest", "normal", "drift", "based_on",
        "missing_today", "risk_ids",
    }
    assert set(report["notes"][0]) == {"day", "at", "kind", "text", "value"}
    assert set(report["linked_risks"][0]) == {"id", "name"}
