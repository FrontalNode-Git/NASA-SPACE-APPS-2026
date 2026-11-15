"""The quick log: a mood, chosen entries and a note are ONE entry on the record."""
from app import simulator as sim

DAY = sim.DEMO_DAY


def _quick(client, member="engineer", viewer=None, **body):
    return client.post(
        f"/api/v1/members/{member}/logs",
        params={"viewer": viewer or member},
        json={"kind": "quick", "day": DAY, **body},
    )


def _real_logs(client, member="engineer"):
    dash = client.get(f"/api/v1/members/{member}/dashboard", params={"viewer": member, "day": DAY}).json()
    return [e for e in dash["logs"] if not e["simulated"]], dash


def test_a_quick_log_is_one_entry_with_everything_joined(client):
    saved = _quick(client, value=4, entries=["Exercise done", "Ate well", "Slept well"], text="TEST").json()
    assert saved["kind"] == "quick" and saved["value"] == 4
    assert saved["text"] == "Mood 4 of five · Exercise done · Ate well · Slept well · TEST"
    assert set(saved) == {"id", "kind", "day", "at", "value", "text", "simulated"}

    logs, dash = _real_logs(client)
    assert len(logs) == 1 and logs[0]["text"] == saved["text"]  # one row, not five
    # The mood in it is today's mood reading, as a logged mood always was.
    mood = next(i for i in dash["indicators"] if i["id"] == "mood")
    assert mood["latest"] == 4 and mood["latest_source"] == "manual"


def test_a_quick_log_can_be_just_entries_or_just_a_note(client):
    assert _quick(client, entries=["Ate well"]).json()["text"] == "Ate well"
    assert _quick(client, text="  felt   steady  today ").json()["text"] == "felt steady today"
    logs, dash = _real_logs(client)
    assert len(logs) == 2
    mood = next(i for i in dash["indicators"] if i["id"] == "mood")
    assert mood["latest_source"] != "manual"  # no mood was given, so the mood reading is untouched


def test_choosing_the_same_entry_twice_is_one_choice_and_blank_ones_are_dropped(client):
    saved = _quick(client, entries=["Ate well", "Ate   well", "", "   ", "Ate well"]).json()
    assert saved["text"] == "Ate well"


def test_an_empty_or_oversized_quick_log_is_refused_in_plain_words(client):
    for body in ({}, {"entries": []}, {"entries": ["", "  "]}, {"text": "   "}):
        response = _quick(client, **body)
        assert response.status_code == 422, body
        assert "needs a mood, an entry or a note" in response.json()["detail"]
    assert _quick(client, entries=["x" * 61]).status_code == 422
    assert _quick(client, entries=[f"entry {i}" for i in range(9)]).status_code == 422
    assert _quick(client, value=9).status_code == 422
    assert _quick(client, text="x" * 281).status_code == 422
    assert _real_logs(client)[0] == []  # nothing was kept from the refused ones


def test_a_quick_log_is_private_like_every_other_log(client):
    assert _quick(client, member="engineer", viewer="cmo", text="not yours").status_code == 403
    _quick(client, text="private quick note", value=3)
    seen_by_cmo = client.get(f"/api/v1/members/engineer/dashboard", params={"viewer": "cmo", "day": DAY}).json()
    assert seen_by_cmo["logs"] == [] and "private quick note" not in str(seen_by_cmo)


def test_the_report_lists_a_quick_log_as_one_line(client):
    _quick(client, value=4, entries=["Exercise done", "Ate well"], text="TEST")
    report = client.get("/api/v1/members/engineer/report", params={"viewer": "engineer", "day": DAY}).json()
    mine = [n for n in report["notes"] if "Exercise done" in (n["text"] or "")]
    assert len(mine) == 1 and mine[0]["text"] == "Mood 4 of five · Exercise done · Ate well · TEST"
    assert report["text"].count("Exercise done") == 1
