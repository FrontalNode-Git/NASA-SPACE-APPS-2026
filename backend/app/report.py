"""Report for ground: a readable daily summary for one (fictional) crew member.

Built for the member's own view, so it may include their notes. Related NASA risks are
named, not linked: sources live in docs/SOURCES.txt, never in the app. All readings are
simulated and the report says so.
"""
from __future__ import annotations

import datetime as dt
from html import escape

from . import baseline as bl
from .content import Content
from .service import Store, dashboard

STATUS_LABEL = {bl.NOMINAL: "Nominal", bl.WATCH: "Watch", bl.CALL: "Call ground"}
STATUS_SHAPE = {bl.NOMINAL: "●", bl.WATCH: "▲", bl.CALL: "■"}


def _fmt(value: object, decimals: int) -> str:
    return "no reading" if value is None else f"{float(value):.{decimals}f}"  # type: ignore[arg-type]


def drift_sentence(drift: dict[str, object]) -> str | None:
    if not drift.get("flag"):
        return None
    days = int(drift["days"])  # type: ignore[call-overload]
    return f"Slowly drifting {drift['direction']} your normal for {days} day{'s' if days != 1 else ''}"


def build_report(content: Content, store: Store, member_id: str, day: int, seed: str) -> dict[str, object]:
    dash = dashboard(content, store, member_id, member_id, day, seed)
    rows = []
    risk_ids: list[str] = []
    for view in dash["indicators"]:  # type: ignore[union-attr]
        ind = content.indicator_by_id[view["id"]]
        base = view.get("baseline")
        drift = drift_sentence(view["drift"])
        attention = view["status"] != bl.NOMINAL
        if attention:
            risk_ids += [r for r in ind.risks if r not in risk_ids]
        rows.append(
            {
                "id": ind.id,
                "name": ind.name,
                "unit": ind.unit,
                "status": view["status"],
                "status_label": STATUS_LABEL[view["status"]],
                "latest": _fmt(view.get("latest"), ind.decimals),
                "normal": None if not base else f"{base['mean']:.{ind.decimals + 1}f} ± {base['sd']:.{ind.decimals + 1}f}",
                "drift": drift,
                "based_on": view["confidence"]["baseline_readings"],
                "missing_today": view["confidence"]["missing_today"],
                "risk_ids": ind.risks,
            }
        )
    risks = [{"id": rid, "name": content.risk_by_id[rid].name} for rid in risk_ids]
    member = dash["member"]
    report: dict[str, object] = {
        "title": "VITA-L report for ground",
        "simulated": True,
        "disclaimer": "Simulated data for a fictional crew member. Statistics against a personal baseline; not a medical assessment.",
        "method_status": content.model.method_status,
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "member": member,
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
        "linked_risks": risks,
    }
    report["text"] = render_text(report)
    return report


def render_text(r: dict[str, object]) -> str:
    member = r["member"]
    lines = [
        str(r["title"]).upper(),
        f"{member['role']} {member['name']} · mission day {r['mission_day']} · {r['phase']['name']}",  # type: ignore[index]
        f"SIMULATED DATA · {r['method_status']} method · generated {r['generated_at']}",
        "",
        f"Overall: {r['overall_label']}" + (" (crew member logged: I'm OK)" if r["acknowledged"] else ""),
        "",
        "Indicators (latest vs personal normal):",
    ]
    for row in r["indicators"]:  # type: ignore[union-attr]
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
        for n in r["notes"]:  # type: ignore[union-attr]
            body = n["text"] or (f"mood {n['value']} of five" if n["kind"] == "mood" else "I'm OK")
            lines.append(f"  day {n['day']} {n['at']} · {body}")
    if r["linked_risks"]:
        lines += ["", "Related NASA Human Research Program risks:"]
        lines += [f"  {x['name']}" for x in r["linked_risks"]]  # type: ignore[union-attr]
    lines += ["", str(r["disclaimer"])]
    return "\n".join(lines)


def render_html(r: dict[str, object]) -> str:
    """Self-contained printable page (use the browser's Print → Save as PDF)."""
    member = r["member"]
    rows = "".join(
        "<tr><td>{shape} {status}</td><td>{name}</td><td>{latest} {unit}</td><td>{normal}</td><td>{drift}</td></tr>".format(
            shape=STATUS_SHAPE[row["status"]],
            status=escape(row["status_label"]),
            name=escape(row["name"]),
            latest=escape(row["latest"]),
            unit=escape(row["unit"]),
            normal=escape(f"{row['normal']} · {row['based_on']} readings" if row["normal"] else "—"),
            drift=escape(row["drift"] or ("Reading missing today" if row["missing_today"] else "—")),
        )
        for row in r["indicators"]  # type: ignore[union-attr]
    )
    notes = "".join(
        f"<li>Day {n['day']} {escape(str(n['at']))} · "
        + escape(str(n["text"] or (f"mood {n['value']} of five" if n["kind"] == "mood" else "I'm OK")))
        + "</li>"
        for n in r["notes"]  # type: ignore[union-attr]
    )
    risks = "".join(f"<li>{escape(x['name'])}</li>" for x in r["linked_risks"])  # type: ignore[union-attr]
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{escape(str(r['title']))}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:16px;margin:24px 0 8px}}
.banner{{border:2px solid #111;padding:8px 12px;margin:14px 0;font-weight:600}}
table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #bbb;vertical-align:top}}
.muted{{color:#555}} button{{font:inherit;padding:8px 14px;margin-top:16px}}
@media print{{button{{display:none}} body{{margin:0}}}}
</style></head><body>
<h1>{escape(str(r['title']))}</h1>
<div class="muted">{escape(member['role'])} {escape(member['name'])} · mission day {r['mission_day']} · {escape(r['phase']['name'])} · generated {escape(str(r['generated_at']))}</div>
<div class="banner">SIMULATED DATA — fictional crew member. {escape(str(r['method_status']).capitalize())} method. Not a medical assessment.</div>
<p><strong>Overall: {STATUS_SHAPE[str(r['overall'])]} {escape(str(r['overall_label']))}</strong>{" · crew member logged “I'm OK”" if r['acknowledged'] else ""}</p>
<h2>Indicators against the crew member's own normal</h2>
<table><thead><tr><th>Status</th><th>Indicator</th><th>Latest</th><th>Personal normal</th><th>Trend</th></tr></thead><tbody>{rows}</tbody></table>
{f"<h2>Crew notes</h2><ul>{notes}</ul>" if notes else ""}
{f"<h2>Related NASA Human Research Program risks</h2><ul>{risks}</ul>" if risks else ""}
<p class="muted">{escape(str(r['disclaimer']))}</p>
<button onclick="window.print()">Print / save as PDF</button>
</body></html>"""
