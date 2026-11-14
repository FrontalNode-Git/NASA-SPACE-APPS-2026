import json

from app import simulator as sim

DAY = sim.DEMO_DAY


def _dash(client, member, viewer, day=DAY):
    r = client.get(f"/api/v1/members/{member}/dashboard", params={"viewer": viewer, "day": day})
    assert r.status_code == 200
    return r.json()


def _log(client, member, **body):
    return client.post(f"/api/v1/members/{member}/logs", params={"viewer": member}, json={"day": DAY, **body})


def test_owner_sees_mood_and_notes(client):
    _log(client, "engineer", kind="note", text="private thought")
    dash = _dash(client, "engineer", "engineer")
    mood = next(i for i in dash["indicators"] if i["id"] == "mood")
    assert mood["locked"] is False and mood["series"] and mood["baseline"]
    assert dash["logs_locked"] is False
    assert any(e["text"] == "private thought" for e in dash["logs"])


def test_cmo_sees_status_level_only(client):
    _log(client, "engineer", kind="note", text="private thought")
    _log(client, "engineer", kind="mood", value=2)
    dash = _dash(client, "engineer", "cmo")
    mood = next(i for i in dash["indicators"] if i["id"] == "mood")
    assert set(mood) == {"id", "name", "unit", "decimals", "private", "locked", "status"}
    assert mood["locked"] is True and mood["status"] in {"nominal", "watch", "call_ground"}
    assert dash["logs"] == [] and dash["logs_locked"] is True
    assert "private thought" not in json.dumps(dash)
    # non-private indicators stay fully visible to the CMO
    hr = next(i for i in dash["indicators"] if i["id"] == "heart_rate")
    assert hr["series"] and hr["baseline"]


def test_crew_tiles_never_carry_private_data_and_sort_by_urgency(client):
    _log(client, "systems", kind="note", text="keep this to myself")
    tiles = client.get("/api/v1/crew", params={"viewer": "cmo", "day": DAY}).json()
    assert [t["id"] for t in tiles] == ["systems", "engineer", "commander", "cmo"]
    assert [t["overall"] for t in tiles] == ["call_ground", "watch", "nominal", "nominal"]
    assert [t["needs_attention"] for t in tiles] == [True, True, False, False]
    blob = json.dumps(tiles)
    assert "keep this to myself" not in blob and "mood" not in blob and "text" not in blob
    assert all(t["last_checkin"] for t in tiles)


def test_logging_for_someone_else_is_refused(client):
    r = client.post("/api/v1/members/engineer/logs", params={"viewer": "cmo"},
                    json={"kind": "mood", "day": DAY, "value": 3})
    assert r.status_code == 403
    assert client.get("/api/v1/members/nobody/dashboard").status_code == 404
    assert client.get("/api/v1/members/engineer/dashboard", params={"seed": "nope"}).status_code == 422


def test_quick_log_updates_mood_ok_and_checkin(client):
    r = _log(client, "engineer", kind="mood", value=3)
    assert r.status_code == 200 and r.json()["simulated"] is False
    _log(client, "engineer", kind="ok")
    dash = _dash(client, "engineer", "engineer")
    mood = next(i for i in dash["indicators"] if i["id"] == "mood")
    assert mood["latest"] == 3
    assert dash["acknowledged"] is True
    assert dash["last_checkin"]["simulated"] is False
    assert _log(client, "engineer", kind="mood").status_code == 422


def test_calibration_wizard_sets_a_personal_baseline(client):
    cal = client.get("/api/v1/members/engineer/calibration").json()
    assert cal["saved"] is None and len(cal["simulated"]["heart_rate"]) == sim.PREFLIGHT_DAYS
    values = {"heart_rate": [70, 72, 71, 69, 70, 71, 72]}
    r = client.put("/api/v1/members/engineer/calibration", params={"viewer": "engineer"}, json={"values": values})
    assert r.status_code == 200
    hr = next(i for i in _dash(client, "engineer", "engineer")["indicators"] if i["id"] == "heart_rate")
    assert hr["calibrated_by_member"] is True
    assert hr["baseline"]["n"] == 7 and abs(hr["baseline"]["mean"] - 70.714) < 0.01
    short = client.put("/api/v1/members/engineer/calibration", params={"viewer": "engineer"},
                       json={"values": {"heart_rate": [70, None, None, None, None, None, None]}})
    assert short.status_code == 422
    client.post("/api/v1/demo/reset")
    hr = next(i for i in _dash(client, "engineer", "engineer")["indicators"] if i["id"] == "heart_rate")
    assert hr["calibrated_by_member"] is False


def test_calibration_refuses_values_that_cannot_be_right(client):
    """A slip of the keyboard in the wizard must never leave the dashboard unable to load."""
    url, who = "/api/v1/members/engineer/calibration", {"viewer": "engineer"}
    rest = [61, 62, 63, 64, 65, 66]
    for bad in (1e308, 2_000_000, -50, 0):
        r = client.put(url, params=who, json={"values": {"heart_rate": [bad, *rest]}})
        assert r.status_code == 422, bad
    for raw in ("NaN", "Infinity"):  # not valid JSON numbers, but Python's parser lets them in
        body = '{"values": {"heart_rate": [%s, 61, 62, 63, 64, 65, 66]}}' % raw
        r = client.put(url, params=who, content=body, headers={"Content-Type": "application/json"})
        assert r.status_code == 422, raw
    assert client.put(url, params=who, json={"values": {"spo2": [101, *rest]}}).status_code == 422
    assert client.get(url).json()["saved"] is None, "a refused week saves nothing"
    assert _dash(client, "engineer", "engineer")["overall"] == "watch"  # still the simulated baseline

    # a good week is stored the way the indicator shows it
    saved = client.put(url, params=who, json={"values": {"temperature": [36.74, 36.8, 36.9, 36.7, 36.8, 36.8, 36.9]}})
    assert saved.status_code == 200 and saved.json()["saved"]["temperature"][0] == 36.7


def test_day_zero_has_a_baseline_but_no_mission_readings(client):
    dash = _dash(client, "engineer", "engineer", day=0)
    assert dash["phase"]["id"] == "earth" and dash["overall"] == "nominal"
    hr = next(i for i in dash["indicators"] if i["id"] == "heart_rate")
    assert hr["baseline"]["n"] == 7 and hr["series"] == [] and hr["latest"] is None


def test_each_browser_session_keeps_its_own_state(client):
    """Two people on the same deployment must not see, or reset, each other's logs."""
    a, b = {"X-Vital-Session": "judge-a"}, {"X-Vital-Session": "judge-b"}
    url = "/api/v1/members/engineer"
    client.post(f"{url}/logs", params={"viewer": "engineer"}, headers=a,
                json={"kind": "note", "day": DAY, "text": "only in session a"})

    def notes(headers):
        dash = client.get(f"{url}/dashboard", params={"viewer": "engineer", "day": DAY}, headers=headers).json()
        return [e["text"] for e in dash["logs"]]

    assert "only in session a" in notes(a)
    assert "only in session a" not in notes(b)
    assert "only in session a" not in notes({})  # no header: the shared default session

    client.post("/api/v1/demo/reset", headers=b)
    assert "only in session a" in notes(a), "a reset in one session leaves the others alone"

    # A plain link cannot send headers, so the printable report takes the session in the query.
    page = client.get(f"{url}/report.html", params={"day": DAY, "session": "judge-a"})
    assert "only in session a" in page.text
    assert "only in session a" not in client.get(f"{url}/report.html", params={"day": DAY}).text

    # A malformed id falls back to the default session instead of creating one.
    client.get(f"{url}/dashboard", headers={"X-Vital-Session": "not valid!"})
    from app import main
    assert set(main.sessions) == {"judge-a", "judge-b", "default"}


def test_idle_sessions_are_forgotten_first(client, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "MAX_SESSIONS", 3)
    for name in ("s1", "s2", "s3"):
        client.get("/api/v1/crew", headers={"X-Vital-Session": name})
    client.get("/api/v1/crew", headers={"X-Vital-Session": "s1"})  # s1 is active again
    client.get("/api/v1/crew", headers={"X-Vital-Session": "s4"})  # pushes out the idlest: s2
    assert list(main.sessions) == ["s3", "s1", "s4"]


def _put(client, member, values, viewer=None, day=DAY):
    return client.put(f"/api/v1/members/{member}/readings", params={"viewer": viewer or member},
                      json={"day": day, "values": values})


def _indicator(client, member, viewer, indicator, day=DAY):
    return next(i for i in _dash(client, member, viewer, day)["indicators"] if i["id"] == indicator)


def test_check_in_replaces_the_sensor_value_and_drives_the_status(client):
    before = _indicator(client, "commander", "commander", "heart_rate")
    assert before["latest_source"] == "sensor" and before["status"] == "nominal"

    far_out = before["baseline"]["mean"] + 4 * before["baseline"]["sd"]
    assert _put(client, "commander", {"heart_rate": far_out}).status_code == 200
    after = _indicator(client, "commander", "commander", "heart_rate")
    assert after["latest_source"] == "manual"
    assert after["latest"] == round(far_out)
    assert after["status"] == "call_ground" and after["series"][-1]["value"] == round(far_out)
    assert _dash(client, "commander", "commander")["overall"] == "call_ground"

    # yesterday is untouched, and the entry stays in place when a later day is viewed
    assert _indicator(client, "commander", "commander", "heart_rate", DAY - 1)["latest_source"] == "sensor"
    later = _indicator(client, "commander", "commander", "heart_rate", DAY + 1)
    assert later["latest_source"] == "sensor" and later["series"][-2]["value"] == round(far_out)

    # a null withdraws the entry and the sensor value returns
    assert _put(client, "commander", {"heart_rate": None}).status_code == 200
    restored = _indicator(client, "commander", "commander", "heart_rate")
    assert restored["latest_source"] == "sensor" and restored["latest"] == before["latest"]


def test_check_in_fills_a_missed_reading(client):
    missing = _indicator(client, "cmo", "cmo", "temperature")
    assert missing["latest"] is None and missing["confidence"]["missing_today"] and missing["latest_source"] is None
    _put(client, "cmo", {"temperature": 36.74})
    filled = _indicator(client, "cmo", "cmo", "temperature")
    assert filled["latest"] == 36.7 and filled["latest_source"] == "manual"
    assert filled["confidence"]["missing_today"] is False


def test_check_in_rules(client):
    assert _put(client, "engineer", {"heart_rate": 60}, viewer="cmo").status_code == 403
    assert _put(client, "engineer", {"pulse": 60}).status_code == 422
    assert _put(client, "engineer", {"spo2": 101}).status_code == 422
    assert _put(client, "engineer", {"mood": 0}).status_code == 422
    assert _put(client, "engineer", {"sleep_hours": 25}).status_code == 422
    assert _put(client, "engineer", {"heart_rate": 0}).status_code == 422
    assert _put(client, "engineer", {"heart_rate": 1e308}).status_code == 422
    assert _put(client, "engineer", {"heart_rate": 60}, day=0).status_code == 422
    # one bad value rejects the whole check-in
    assert _put(client, "engineer", {"heart_rate": 61, "spo2": 140}).status_code == 422
    assert _indicator(client, "engineer", "engineer", "heart_rate")["latest_source"] == "sensor"


def test_entered_vitals_reach_the_medical_officer_but_mood_stays_private(client):
    _put(client, "engineer", {"heart_rate": 64, "mood": 2})
    seen_by_cmo = _dash(client, "engineer", "cmo")
    heart = next(i for i in seen_by_cmo["indicators"] if i["id"] == "heart_rate")
    mood = next(i for i in seen_by_cmo["indicators"] if i["id"] == "mood")
    assert heart["latest"] == 64 and heart["latest_source"] == "manual"
    assert mood["locked"] is True and "latest" not in mood and "latest_source" not in mood
