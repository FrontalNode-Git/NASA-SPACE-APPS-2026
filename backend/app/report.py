"""Report for ground: a readable daily summary for one crew member, or for the
whole crew when the Chief Medical Officer asks for it. The medical officer can send the crew
report to the Commander.

A member's own report may include their notes. In the crew report the same privacy rule
holds as everywhere else: for anyone but the owner, private indicators show a status level
only and notes are left out. A report sent to the Commander is built as the Commander may
see it. Related NASA risks are named, not linked: sources
live in docs/SOURCES.txt, never in the app. All readings are simulated and the report says so.
"""
from __future__ import annotations

import datetime as dt
from html import escape

from . import baseline as bl
from .content import Content
from .service import Store, dashboard

STATUS_LABEL = {bl.NOMINAL: "Nominal", bl.WATCH: "Watch", bl.CALL: "Call ground"}
STATUS_SHAPE = {bl.NOMINAL: "●", bl.WATCH: "▲", bl.CALL: "■"}

# The one crew member who may ask for everyone's report, and the one they can send it to.
CREW_REPORT_VIEWER = "cmo"
CREW_REPORT_RECIPIENT = "commander"
PRIVATE_NOTE = "Mood values and notes are private to each crew member; only their status level is shown."


class NotAllowed(Exception):
    """The viewer may not see this report."""


def _fmt(value: object, decimals: int) -> str:
    return "no reading" if value is None else f"{float(value):.{decimals}f}"  # type: ignore[arg-type]


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def drift_sentence(drift: dict[str, object], own: bool = True) -> str | None:
    if not drift.get("flag"):
        return None
    days = int(drift["days"])  # type: ignore[call-overload]
    whose = "your" if own else "their"
    return f"Slowly drifting {drift['direction']} {whose} normal for {days} day{'s' if days != 1 else ''}"


def build_report(
    content: Content, store: Store, member_id: str, day: int, seed: str, viewer: str | None = None
) -> dict[str, object]:
    """One member's report, as seen by `viewer` (by default the member themself)."""
    dash = dashboard(content, store, member_id, viewer or member_id, day, seed)
    own = bool(dash["own"])
    rows = []
    risk_ids: list[str] = []
    for view in dash["indicators"]:  # type: ignore[union-attr]
        ind = content.indicator_by_id[view["id"]]
        if view["status"] != bl.NOMINAL:
            risk_ids += [r for r in ind.risks if r not in risk_ids]
        row = {
            "id": ind.id,
            "name": ind.name,
            "unit": ind.unit,
            "status": view["status"],
            "status_label": STATUS_LABEL[view["status"]],
            "private": bool(view.get("locked")),
            "risk_ids": ind.risks,
        }
        if view.get("locked"):
            # Someone else's private indicator: the status level and nothing more.
            row |= {"latest": "private", "normal": None, "drift": None, "based_on": 0, "missing_today": False}
        else:
            base = view.get("baseline")
            row |= {
                "latest": _fmt(view.get("latest"), ind.decimals),
                "normal": None if not base else f"{base['mean']:.{ind.decimals + 1}f} ± {base['sd']:.{ind.decimals + 1}f}",
                "drift": drift_sentence(view["drift"], own),
                "based_on": view["confidence"]["baseline_readings"],
                "missing_today": view["confidence"]["missing_today"],
            }
        rows.append(row)
    risks = [{"id": rid, "name": content.risk_by_id[rid].name} for rid in risk_ids]
    report: dict[str, object] = {
        "title": "VITAL report for ground",
        "simulated": True,
        "disclaimer": "Simulated readings for a crew member. Statistics against a personal baseline; not a medical assessment.",
        "method_status": content.model.method_status,
        "generated_at": _now(),
        "member": dash["member"],
        "mission_day": day,
        "phase": dash["phase"],
        "seed": seed,
        "overall": dash["overall"],
        "overall_label": STATUS_LABEL[str(dash["overall"])],
        "acknowledged": dash["acknowledged"],
        "indicators": rows,
        "drifts": [f"{r['name']}: {r['drift']}" for r in rows if r["drift"]],
        "missing": [r["name"] for r in rows if r["missing_today"]],
        "notes": [
            {"day": e["day"], "at": e["at"], "kind": e["kind"], "text": e["text"], "value": e["value"]}
            for e in dash["logs"]  # type: ignore[union-attr]
        ],
        "notes_private": not own,
        "linked_risks": risks,
    }
    report["text"] = render_text(report)
    return report


def build_crew_report(
    content: Content, store: Store, viewer: str, day: int, seed: str, reader: str | None = None
) -> dict[str, object]:
    """Every crew member's report in one, for the Chief Medical Officer.

    `reader` is who will read it (by default the medical officer). Private data of anyone but
    the reader stays out, so a copy for the Commander never carries the medical officer's notes.
    """
    if viewer != CREW_REPORT_VIEWER:
        raise NotAllowed("only the Chief Medical Officer can get the report for the whole crew")
    members = [build_report(content, store, m.id, day, seed, viewer=reader or viewer) for m in content.model.crew]
    overall = bl.worst([str(m["overall"]) for m in members])
    report: dict[str, object] = {
        "title": "VITAL crew report for ground",
        "simulated": True,
        "disclaimer": "Simulated readings for the crew. Statistics against each personal baseline; not a medical assessment.",
        "privacy": PRIVATE_NOTE,
        "method_status": content.model.method_status,
        "generated_at": _now(),
        "requested_by": next(m["member"] for m in members if m["member"]["id"] == viewer),  # type: ignore[index]
        "mission_day": day,
        "phase": members[0]["phase"],
        "seed": seed,
        "overall": overall,
        "overall_label": STATUS_LABEL[overall],
        "attention": [m["member"] for m in members if m["overall"] != bl.NOMINAL],
        "members": members,
    }
    report["text"] = render_crew_text(report)
    return report


def _who(r: dict[str, object]) -> str:
    member = r["member"]
    return f"{member['role']} {member['name']}"  # type: ignore[index]


def _note_body(n: dict[str, object]) -> str:
    return str(n["text"] or (f"mood {n['value']} of five" if n["kind"] == "mood" else "I'm OK"))


def _member_lines(r: dict[str, object]) -> list[str]:
    """The body of one member's report, without a title or the closing disclaimer."""
    lines = [
        f"Overall: {r['overall_label']}" + (" (crew member logged: I'm OK)" if r["acknowledged"] else ""),
        "",
        "Indicators (latest vs personal normal):",
    ]
    for row in r["indicators"]:  # type: ignore[union-attr]
        if row["private"]:
            lines.append(f"  {STATUS_SHAPE[row['status']]} {row['name']}: {row['status_label']} · value private")
            continue
        line = f"  {STATUS_SHAPE[row['status']]} {row['name']}: {row['latest']} {row['unit']} · {row['status_label']}"
        if row["normal"]:
            line += f" · normal {row['normal']} (based on {row['based_on']} readings)"
        if row["drift"]:
            line += f" · {row['drift']}"
        lines.append(line)
    if r["missing"]:
        lines += ["", "Missing today: " + ", ".join(r["missing"])]  # type: ignore[arg-type]
    if r["notes"]:
        lines += ["", "Crew notes:"]
        lines += [f"  day {n['day']} {n['at']} · {_note_body(n)}" for n in r["notes"]]  # type: ignore[union-attr]
    if r["linked_risks"]:
        lines += ["", "Related NASA Human Research Program risks:"]
        lines += [f"  {x['name']}" for x in r["linked_risks"]]  # type: ignore[union-attr]
    return lines


def render_text(r: dict[str, object]) -> str:
    lines = [
        str(r["title"]).upper(),
        f"{_who(r)} · mission day {r['mission_day']} · {r['phase']['name']}",  # type: ignore[index]
        f"SIMULATED DATA · {r['method_status']} method · generated {r['generated_at']}",
        "",
        *_member_lines(r),
        "",
        str(r["disclaimer"]),
    ]
    return "\n".join(lines)


def render_crew_text(c: dict[str, object]) -> str:
    members: list[dict[str, object]] = c["members"]  # type: ignore[assignment]
    by = c["requested_by"]
    lines = [
        str(c["title"]).upper(),
        f"Mission day {c['mission_day']} · {c['phase']['name']} · {len(members)} crew members",  # type: ignore[index]
        f"SIMULATED DATA · {c['method_status']} method · generated {c['generated_at']}",
        f"Requested by {by['role']} {by['name']}",  # type: ignore[index]
        "",
        f"Crew overall: {c['overall_label']}",
    ]
    lines += [f"  {STATUS_SHAPE[str(m['overall'])]} {_who(m)}: {m['overall_label']}" for m in members]
    for m in members:
        lines += ["", "-" * 60, _who(m).upper(), *_member_lines(m)]
    lines += ["", "-" * 60, str(c["privacy"]), str(c["disclaimer"])]
    return "\n".join(lines)


def _member_html(r: dict[str, object]) -> str:
    """The body of one member's report as HTML, without the page around it."""
    rows = "".join(
        "<tr><td>{shape} {status}</td><td>{name}</td><td>{latest}</td><td>{normal}</td><td>{drift}</td></tr>".format(
            shape=STATUS_SHAPE[row["status"]],
            status=escape(row["status_label"]),
            name=escape(row["name"]),
            latest="Private" if row["private"] else escape(f"{row['latest']} {row['unit']}"),
            normal=escape(f"{row['normal']} · {row['based_on']} readings" if row["normal"] else "—"),
            drift=escape(row["drift"] or ("Reading missing today" if row["missing_today"] else "—")),
        )
        for row in r["indicators"]  # type: ignore[union-attr]
    )
    notes = "".join(
        f"<li>Day {n['day']} {escape(str(n['at']))} · {escape(_note_body(n))}</li>"
        for n in r["notes"]  # type: ignore[union-attr]
    )
    risks = "".join(f"<li>{escape(x['name'])}</li>" for x in r["linked_risks"])  # type: ignore[union-attr]
    return f"""<p><strong>Overall: {STATUS_SHAPE[str(r['overall'])]} {escape(str(r['overall_label']))}</strong>{" · crew member logged “I'm OK”" if r['acknowledged'] else ""}</p>
<h3>Indicators against the crew member's own normal</h3>
<table><thead><tr><th>Status</th><th>Indicator</th><th>Latest</th><th>Personal normal</th><th>Trend</th></tr></thead><tbody>{rows}</tbody></table>
{f"<h3>Crew notes</h3><ul>{notes}</ul>" if notes else ""}
{f"<h3>Related NASA Human Research Program risks</h3><ul>{risks}</ul>" if risks else ""}"""


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:18px;margin:28px 0 4px}} h3{{font-size:15px;margin:18px 0 6px}}
.banner{{border:2px solid #111;padding:8px 12px;margin:14px 0;font-weight:600}}
table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #bbb;vertical-align:top}}
.muted{{color:#555}} button{{font:inherit;padding:8px 14px;margin-top:16px}}
section{{break-inside:avoid;border-top:2px solid #111;margin-top:24px}}
@media print{{button{{display:none}} body{{margin:0}}}}
</style></head><body>
<h1>{escape(title)}</h1>
{body}
<button onclick="window.print()">Print / save as PDF</button>
</body></html>"""


def render_html(r: dict[str, object]) -> str:
    """Self-contained printable page (use the browser's Print → Save as PDF)."""
    body = f"""<div class="muted">{escape(_who(r))} · mission day {r['mission_day']} · {escape(r['phase']['name'])} · generated {escape(str(r['generated_at']))}</div>
<div class="banner">SIMULATED DATA — the readings are not real. {escape(str(r['method_status']).capitalize())} method. Not a medical assessment.</div>
{_member_html(r)}
<p class="muted">{escape(str(r['disclaimer']))}</p>"""
    return _page(str(r["title"]), body)


def render_crew_html(c: dict[str, object]) -> str:
    """The crew report as one printable page, one section per crew member."""
    members: list[dict[str, object]] = c["members"]  # type: ignore[assignment]
    by = c["requested_by"]
    summary = "".join(
        f"<li>{STATUS_SHAPE[str(m['overall'])]} {escape(_who(m))}: {escape(str(m['overall_label']))}</li>" for m in members
    )
    sections = "".join(f"<section><h2>{escape(_who(m))}</h2>{_member_html(m)}</section>" for m in members)
    body = f"""<div class="muted">Mission day {c['mission_day']} · {escape(c['phase']['name'])} · requested by {escape(by['role'])} {escape(by['name'])} · generated {escape(str(c['generated_at']))}</div>
<div class="banner">SIMULATED DATA — the readings are not real. {escape(str(c['method_status']).capitalize())} method. Not a medical assessment.</div>
<p><strong>Crew overall: {STATUS_SHAPE[str(c['overall'])]} {escape(str(c['overall_label']))}</strong></p>
<ul>{summary}</ul>
{sections}
<p class="muted">{escape(str(c['privacy']))}<br>{escape(str(c['disclaimer']))}</p>"""
    return _page(str(c["title"]), body)
