from app import simulator as sim

DAY = sim.DEMO_DAY


def test_report_summarises_statuses_drifts_and_links_risks(client, content):
    client.post("/api/v1/members/engineer/logs", params={"viewer": "engineer"}, json={"kind": "ok", "day": DAY})
    report = client.get("/api/v1/members/engineer/report", params={"day": DAY}).json()
    assert report["simulated"] is True and "Simulated" in report["disclaimer"]
    assert report["overall"] == "watch" and report["acknowledged"] is True
    assert report["drifts"] == ["Resting heart rate: Slowly drifting above your normal for 5 days"]
    hr = next(r for r in report["indicators"] if r["id"] == "heart_rate")
    assert hr["status_label"] == "Watch" and hr["based_on"] == 7 and "±" in hr["normal"]
    # the flagged indicator's NASA risks are named, never linked: the app shows no sources
    assert {r["id"] for r in report["linked_risks"]} == {"cardiovascular", "fitness"}
    for risk in report["linked_risks"]:
        assert set(risk) == {"id", "name"}
        assert risk["name"] == content.risk_by_id[risk["id"]].name
        assert risk["name"] in report["text"]
    assert "http" not in report["text"]
    assert "SIMULATED DATA" in report["text"]
    assert any(n["kind"] == "ok" for n in report["notes"])


def test_quiet_day_report_links_no_risks(client):
    report = client.get("/api/v1/members/commander/report", params={"viewer": "commander", "day": 8}).json()
    assert report["overall"] == "nominal" and report["linked_risks"] == [] and report["drifts"] == []


def test_missing_reading_is_reported(client):
    report = client.get("/api/v1/members/cmo/report", params={"viewer": "cmo", "day": DAY}).json()
    assert report["missing"] == ["Body temperature"]
    assert "Missing today: Body temperature" in report["text"]


def test_printable_html(client):
    r = client.get("/api/v1/members/engineer/report.html", params={"day": DAY})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "SIMULATED DATA" in r.text and "window.print()" in r.text
    assert "Slowly drifting above your normal for 5 days" in r.text
    assert "<script" not in r.text.lower()
    assert "http" not in r.text and "<a " not in r.text, "the printable report carries no source links"
    assert "Risk of Cardiovascular Adaptations" in r.text
