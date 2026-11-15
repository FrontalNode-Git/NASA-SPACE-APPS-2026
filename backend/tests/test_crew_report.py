"""The crew report: the Chief Medical Officer gets it and can send it to the Commander."""
import json

from app import simulator as sim

DAY = sim.DEMO_DAY
CREW = "/api/v1/crew/report"


def _note(client, member: str) -> None:
    client.post(f"/api/v1/members/{member}/logs", params={"viewer": member},
                json={"kind": "note", "day": DAY, "text": f"private thought of {member}"})


def test_medical_officer_gets_a_report_for_the_whole_crew(client, content):
    crew = client.get(CREW, params={"viewer": "cmo", "day": DAY}).json()
    assert [m["member"]["id"] for m in crew["members"]] == [m.id for m in content.model.crew]
    assert crew["simulated"] is True and "SIMULATED DATA" in crew["text"]
    assert crew["requested_by"]["id"] == "cmo"
    # the engineer's drift is in the crew report, worded for someone else reading it
    engineer = next(m for m in crew["members"] if m["member"]["id"] == "engineer")
    assert engineer["overall"] == "watch" and crew["overall"] != "nominal"
    assert engineer["drifts"] == ["Resting heart rate: Slowly drifting above their normal for 5 days"]
    assert "engineer" in [m["id"] for m in crew["attention"]]
    for m in crew["members"]:
        assert f"{m['member']['role']} {m['member']['name']}".upper() in crew["text"]
    assert "http" not in crew["text"]
    page = client.get(f"{CREW}.html", params={"viewer": "cmo", "day": DAY})
    assert page.status_code == 200 and all(m["member"]["name"] in page.text for m in crew["members"])


def test_crew_report_keeps_other_members_mood_and_notes_private(client):
    for member in ("engineer", "cmo"):
        _note(client, member)
    client.post("/api/v1/members/engineer/logs", params={"viewer": "engineer"}, json={"kind": "mood", "day": DAY, "value": 2})
    crew = client.get(CREW, params={"viewer": "cmo", "day": DAY}).json()
    text = json.dumps(crew)
    assert "private thought of engineer" not in text
    assert "private thought of cmo" in text  # the medical officer's own notes are theirs to send
    engineer = next(m for m in crew["members"] if m["member"]["id"] == "engineer")
    assert engineer["notes"] == [] and engineer["notes_private"] is True
    mood = next(r for r in engineer["indicators"] if r["id"] == "mood")
    assert mood["private"] is True and mood["latest"] == "private" and mood["normal"] is None
    assert mood["status"] in {"nominal", "watch", "call_ground"}  # the status level is still reported
    own = next(m for m in crew["members"] if m["member"]["id"] == "cmo")
    assert own["notes_private"] is False and all(not r["private"] for r in own["indicators"])
    assert "private thought of engineer" not in client.get(f"{CREW}.html", params={"viewer": "cmo", "day": DAY}).text


def test_only_the_medical_officer_gets_the_crew_report(client):
    for viewer in ("engineer", "commander", "systems"):
        assert client.get(CREW, params={"viewer": viewer, "day": DAY}).status_code == 403
        assert client.get(f"{CREW}.html", params={"viewer": viewer, "day": DAY}).status_code == 403
        assert client.post(f"{CREW}/notify", params={"viewer": viewer, "day": DAY}).status_code == 403
    assert client.get(CREW, params={"day": DAY}).status_code == 403  # no viewer named
    assert client.get(CREW, params={"viewer": "nobody", "day": DAY}).status_code in {403, 404}


def test_medical_officer_sends_the_crew_report_to_the_commander(client):
    for member in ("engineer", "cmo", "commander"):
        _note(client, member)
    assert client.get(f"{CREW}/notices", params={"viewer": "commander"}).json() == []

    sent = client.post(f"{CREW}/notify", params={"viewer": "cmo", "day": DAY}).json()
    assert sent["from"]["id"] == "cmo" and sent["to"]["id"] == "commander"
    assert sent["day"] == DAY and sent["read"] is False
    assert sent["report"] is None  # the sender's copy of the notice does not carry the Commander's view

    (notice,) = client.get(f"{CREW}/notices", params={"viewer": "commander"}).json()
    assert notice["id"] == sent["id"] and notice["overall"] == notice["report"]["overall"]
    assert [m["member"]["id"] for m in notice["report"]["members"]] == ["commander", "cmo", "systems", "engineer"]
    # Built as the Commander may see it: their own notes, nobody else's, not even the sender's.
    text = json.dumps(notice)
    assert "private thought of commander" in text
    assert "private thought of cmo" not in text and "private thought of engineer" not in text
    page = client.get(f"{CREW}/notices/{notice['id']}/report.html", params={"viewer": "commander"})
    assert page.status_code == 200 and "private thought of cmo" not in page.text and "M. Ruiz" in page.text

    # The medical officer sees that it was sent, without the Commander's copy. Nobody else sees it.
    (mine,) = client.get(f"{CREW}/notices", params={"viewer": "cmo"}).json()
    assert mine["id"] == sent["id"] and mine["report"] is None
    assert client.get(f"{CREW}/notices", params={"viewer": "engineer"}).json() == []
    assert client.get(f"{CREW}/notices/{notice['id']}/report.html", params={"viewer": "engineer"}).status_code == 404
    assert client.post(f"{CREW}/notices/{notice['id']}/read", params={"viewer": "cmo"}).status_code == 404

    assert client.post(f"{CREW}/notices/{notice['id']}/read", params={"viewer": "commander"}).json() == {"ok": True}
    assert client.get(f"{CREW}/notices", params={"viewer": "commander"}).json()[0]["read"] is True


def test_a_newer_crew_report_for_the_same_day_replaces_the_older(client):
    first = client.post(f"{CREW}/notify", params={"viewer": "cmo", "day": DAY}).json()
    client.post(f"{CREW}/notify", params={"viewer": "cmo", "day": 8})
    second = client.post(f"{CREW}/notify", params={"viewer": "cmo", "day": DAY}).json()
    notices = client.get(f"{CREW}/notices", params={"viewer": "commander"}).json()
    assert [n["day"] for n in notices] == [DAY, 8]  # newest first, one per day
    assert notices[0]["id"] == second["id"] != first["id"] and notices[0]["read"] is False
    client.post("/api/v1/demo/reset")
    assert client.get(f"{CREW}/notices", params={"viewer": "commander"}).json() == []
