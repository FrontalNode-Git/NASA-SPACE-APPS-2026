from app.content import Content


def test_bundle_shape(client):
    bundle = client.get("/api/v1/content/bundle").json()
    assert [h["short"] for h in bundle["hazards"]] == [
        "Radiation", "Isolation", "Distance", "Gravity", "Hostile environment",
    ]
    assert len(bundle["risks"]) == bundle["coverage"]["total"]
    assert {s["group"] for s in bundle["research"]} == {"artemis-ii", "leo", "past"}
    fact_ids = {f["id"] for f in bundle["facts"]}
    for risk in bundle["risks"]:
        assert risk["fact_id"] in fact_ids
    for part in ("facts", "hazards", "risks", "research", "pending", "coverage"):
        assert client.get(f"/api/v1/content/{part}").status_code == 200
    assert client.get("/api/v1/content/nope").status_code == 404


def test_hazard_links_follow_the_data(content):
    links = content.hazard_links()
    assert links["risks"]["bone"] == ["gravity"]
    assert links["indicators"]["heart_rate"] == ["gravity"]  # through its linked risks
    assert set(links["studies"]["archer"]) == {"radiation", "isolation", "distance"}  # via the behavioral risk
    assert "gravity" in links["zones"]["bones"]
    assert links["environments"]["mars-surface"] == ["distance", "gravity"]
    assert links["environments"]["pressurized-rover"] == []


def test_pending_disappears_when_the_fact_is_added(content):
    before = {p["id"] for p in content.pending()}
    assert before == {"distance-comm-delay", "radiation-dose-rate", "env-pressurized-rover"}

    delay = content.all_facts[0].model_copy(update={"id": "distance-comm-delay"})
    richer = Content([*content.all_facts, delay], content.hazards, content.risks, content.research,
                     content.model, content.approved_urls)
    assert {p["id"] for p in richer.pending()} == {"radiation-dose-rate", "env-pressurized-rover"}


def test_coverage_is_computed_not_typed(content):
    cov = content.coverage()
    assert cov["total"] == len(content.risks) == 17
    monitored = [r["risk_id"] for r in cov["rows"] if r["level"] == "monitored"]
    assert cov["monitored"] == len(monitored)
    assert set(monitored) == {risk for ind in content.model.indicators for risk in ind.risks}
    assert cov["monitored"] + cov["partial"] + cov["pending"] == cov["total"]
    for row in cov["rows"]:
        assert set(row["cells"]) == {f.id for f in content.model.features}
    # a risk with no indicator, zone or hazard link has nothing in the app yet
    by_id = {r["risk_id"]: r["level"] for r in cov["rows"]}
    assert by_id["spacewalk"] == "pending" and by_id["bone"] == "partial" and by_id["sleep"] == "monitored"


MODULES = {"LIVE_SPACE_WEATHER", "DISTANCE_ENGINE", "TRIAGE_PROTOCOLS", "ECLSS_MODELS"}


def test_optional_modules_are_off_by_default(client, monkeypatch):
    for name in MODULES:
        monkeypatch.delenv(name, raising=False)
    cfg = client.get("/api/v1/config").json()
    assert {m["id"] for m in cfg["modules"]} == MODULES
    assert not any(m["enabled"] for m in cfg["modules"])


def test_a_module_flag_switches_on_only_through_the_environment(client, monkeypatch):
    for name in MODULES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LIVE_SPACE_WEATHER", "true")
    enabled = {m["id"] for m in client.get("/api/v1/config").json()["modules"] if m["enabled"]}
    assert enabled == {"LIVE_SPACE_WEATHER"}


def test_mission_phases_cover_every_day(content):
    mission = content.model.mission
    assert content.phase_for_day(0).id == "earth"
    assert content.phase_for_day(1).id == "transit-out"
    assert content.phase_for_day(183).id == "mars-surface"
    assert content.phase_for_day(mission.total_days).id == "return"
    days = [d for p in mission.phases for d in (p.start, p.end)]
    assert days == sorted(days)
