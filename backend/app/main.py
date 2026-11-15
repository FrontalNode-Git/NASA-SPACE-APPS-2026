"""FastAPI app: content service, crew dashboards, logs, calibration, report, static frontend.

The full list of routes, with live "try it" forms, is at /api/v1/docs when the server runs.
The shapes the frontend depends on are pinned in tests/test_contract.py.
"""
from __future__ import annotations

import datetime as dt
import re
from collections import OrderedDict
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, service
from . import simulator as sim
from .content import get_content
from .report import (
    CREW_REPORT_RECIPIENT,
    NotAllowed,
    build_crew_report,
    build_report,
    render_crew_html,
    render_html,
)

API = "/api/v1"
MAX_SESSIONS = 300
DEFAULT_SESSION = "default"

# One Store per browser session, so people using the same deployment at the same time do
# not see each other's logs, and one person's "Reset demo" does not wipe everyone's.
sessions: OrderedDict[str, service.Store] = OrderedDict()

Day = Query(sim.DEMO_DAY, ge=0, le=sim.MAX_DAY)
Seed = Query("demo")


def get_store(
    x_vital_session: str | None = Header(default=None),
    session: str | None = Query(default=None, description="Same as the X-Vital-Session header, for plain links."),
) -> service.Store:
    """The caller's own state. The id is an opaque token the frontend makes up once per browser."""
    key = x_vital_session or session or DEFAULT_SESSION
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", key):
        key = DEFAULT_SESSION
    store = sessions.get(key)
    if store is None:
        store = sessions[key] = service.Store()
        while len(sessions) > MAX_SESSIONS:
            sessions.popitem(last=False)  # forget the session that has been idle longest
    sessions.move_to_end(key)
    return store


Session = Depends(get_store)


class LogIn(BaseModel):
    """One thing the crew member logs. A "quick" log is one entry made of a mood (`value`), chosen
    `entries` and a note (`text`); the server joins them into a single line."""

    kind: Literal["mood", "entry", "ok", "note", "quick"]
    day: int = Field(ge=0, le=sim.MAX_DAY)
    value: int | None = Field(default=None, ge=1, le=5)
    text: str | None = Field(default=None, max_length=280)
    entries: list[str] | None = Field(default=None, max_length=service.QUICK_ENTRY_LIMIT)


class ReadingsIn(BaseModel):
    """A daily check-in. A null value withdraws that entry so the simulated value shows again."""

    day: int = Field(ge=1, le=sim.MAX_DAY)
    values: dict[str, float | None]


class CalibrationIn(BaseModel):
    values: dict[str, list[float | None]]


def _own(member: str, viewer: str, what: str) -> None:
    """Reports and calibration hold mood values and notes, so only their owner may open them."""
    if member not in sim.PROFILES:
        raise service.UnknownMember(member)
    if viewer != member:
        raise HTTPException(status_code=403, detail=f"only {member} can see their own {what}")


def _seed(seed: str) -> str:
    if seed not in sim.SCENARIOS:
        raise HTTPException(status_code=422, detail=f"unknown seed {seed!r}")
    return seed


def create_app() -> FastAPI:
    app = FastAPI(title="VITAL", version="1.0.0", docs_url=f"{API}/docs", openapi_url=f"{API}/openapi.json")

    @app.exception_handler(service.UnknownMember)
    async def _unknown_member(_request: object, exc: service.UnknownMember) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": f"unknown crew member {exc.args[0]!r}"})

    # ------------------------------------------------------------ meta
    @app.get(f"{API}/health", tags=["meta"])
    def health() -> dict[str, object]:
        content = get_content()
        return {"status": "ok", "facts": len(content.facts), "problems": len(content.validate())}

    @app.get(f"{API}/config", tags=["meta"])
    def get_config() -> dict[str, object]:
        return {
            "modules": config.flags(),
            "demo_day": sim.DEMO_DAY,
            "max_day": sim.MAX_DAY,
            "preflight_days": sim.PREFLIGHT_DAYS,
            "seeds": [{"id": key, "label": sc.label} for key, sc in sim.SCENARIOS.items()],
        }

    # ------------------------------------------------------------ content
    @app.get(f"{API}/content/bundle", tags=["content"])
    def content_bundle() -> dict[str, object]:
        return get_content().bundle()

    @app.get(f"{API}/content/{{part}}", tags=["content"])
    def content_part(part: str) -> object:
        bundle = get_content().bundle()
        if part not in bundle:
            raise HTTPException(status_code=404, detail=f"no content part {part!r}")
        return bundle[part]

    # ------------------------------------------------------------ crew
    @app.get(f"{API}/crew", tags=["crew"])
    def crew(viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session) -> list[dict[str, object]]:
        return service.crew(get_content(), store, viewer, day, _seed(seed))

    @app.get(f"{API}/members/{{member}}/dashboard", tags=["crew"])
    def dashboard(
        member: str, viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session
    ) -> dict[str, object]:
        return service.dashboard(get_content(), store, member, viewer, day, _seed(seed))

    @app.post(f"{API}/members/{{member}}/logs", tags=["crew"])
    def add_log(member: str, body: LogIn, viewer: str = "engineer", store: service.Store = Session) -> dict[str, object]:
        if viewer != member:
            raise HTTPException(status_code=403, detail="crew members can only log for themselves")
        if member not in sim.PROFILES:
            raise service.UnknownMember(member)
        if body.kind == "mood" and body.value is None:
            raise HTTPException(status_code=422, detail="mood needs a value from one to five")
        if body.kind == "quick":
            try:
                text = service.quick_log_text(body.value, body.entries, body.text)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            return store.add_log(member, "quick", body.day, body.value, text)
        return store.add_log(member, body.kind, body.day, body.value, body.text)

    @app.put(f"{API}/members/{{member}}/readings", tags=["crew"])
    def put_readings(member: str, body: ReadingsIn, viewer: str = "engineer", store: service.Store = Session) -> dict[str, bool]:
        if viewer != member:
            raise HTTPException(status_code=403, detail="crew members enter their own readings")
        try:
            service.save_readings(get_content(), store, member, body.day, body.values)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"ok": True}

    # ------------------------------------------------------------ calibration
    @app.get(f"{API}/members/{{member}}/calibration", tags=["calibration"])
    def get_calibration(
        member: str, viewer: str = "engineer", seed: str = Seed, store: service.Store = Session
    ) -> dict[str, object]:
        _own(member, viewer, "calibration")
        simulated = service.simulated_calibration(get_content(), member, _seed(seed))
        return {"simulated": simulated, "saved": store.calibration.get(member)}

    @app.put(f"{API}/members/{{member}}/calibration", tags=["calibration"])
    def put_calibration(
        member: str, body: CalibrationIn, viewer: str = "engineer", store: service.Store = Session
    ) -> dict[str, object]:
        if viewer != member:
            raise HTTPException(status_code=403, detail="crew members calibrate their own baseline")
        try:
            service.save_calibration(get_content(), store, member, body.values)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"saved": store.calibration[member]}

    @app.delete(f"{API}/members/{{member}}/calibration", tags=["calibration"])
    def delete_calibration(member: str, viewer: str = "engineer", store: service.Store = Session) -> dict[str, bool]:
        _own(member, viewer, "calibration")
        store.calibration.pop(member, None)
        return {"ok": True}

    # ------------------------------------------------------------ report
    @app.get(f"{API}/members/{{member}}/report", tags=["report"])
    def report(
        member: str, viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session
    ) -> dict[str, object]:
        _own(member, viewer, "report")
        return build_report(get_content(), store, member, day, _seed(seed))

    @app.get(f"{API}/members/{{member}}/report.html", response_class=HTMLResponse, tags=["report"])
    def report_html(
        member: str, viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session
    ) -> str:
        _own(member, viewer, "report")
        return render_html(build_report(get_content(), store, member, day, _seed(seed)))

    # The medical officer's report for the whole crew, and sending it to the Commander.
    def _crew_report(viewer: str, day: int, seed: str, store: service.Store, reader: str | None = None) -> dict[str, object]:
        try:
            return build_crew_report(get_content(), store, viewer, day, _seed(seed), reader)
        except NotAllowed as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

    @app.get(f"{API}/crew/report", tags=["report"])
    def crew_report(viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session) -> dict[str, object]:
        return _crew_report(viewer, day, seed, store)

    @app.get(f"{API}/crew/report.html", response_class=HTMLResponse, tags=["report"])
    def crew_report_html(viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session) -> str:
        return render_crew_html(_crew_report(viewer, day, seed, store))

    def _notice_for(notice: dict[str, object], viewer: str) -> dict[str, object]:
        """The sender sees that it was sent; only the recipient gets the report itself."""
        mine = notice["to"]["id"] == viewer  # type: ignore[index]
        return {**notice, "report": notice["report"] if mine else None}

    def _received(store: service.Store, notice_id: int, viewer: str) -> dict[str, object]:
        for notice in store.notices:
            if notice["id"] == notice_id and notice["to"]["id"] == viewer:  # type: ignore[index]
                return notice
        raise HTTPException(status_code=404, detail="no such crew report was sent to you")

    @app.post(f"{API}/crew/report/notify", tags=["report"])
    def notify_commander(viewer: str = "engineer", day: int = Day, seed: str = Seed, store: service.Store = Session) -> dict[str, object]:
        """Send the day's crew report to the Commander, built as the Commander may see it."""
        report = _crew_report(viewer, day, seed, store, reader=CREW_REPORT_RECIPIENT)
        notice = store.add_notice(
            {
                "from": report["requested_by"],
                "to": service._member(get_content(), CREW_REPORT_RECIPIENT),
                "day": day,
                "sent_at": dt.datetime.now().strftime("%H:%M"),
                "overall": report["overall"],
                "read": False,
                "report": report,
            }
        )
        return _notice_for(notice, viewer)

    @app.get(f"{API}/crew/report/notices", tags=["report"])
    def crew_notices(viewer: str = "engineer", store: service.Store = Session) -> list[dict[str, object]]:
        """Crew reports this viewer sent or received, newest first."""
        service._member(get_content(), viewer)
        mine = [n for n in store.notices if viewer in (n["to"]["id"], n["from"]["id"])]  # type: ignore[index]
        mine.sort(key=lambda n: int(n["id"]), reverse=True)  # type: ignore[call-overload]
        return [_notice_for(n, viewer) for n in mine]

    @app.post(f"{API}/crew/report/notices/{{notice_id}}/read", tags=["report"])
    def read_notice(notice_id: int, viewer: str = "engineer", store: service.Store = Session) -> dict[str, bool]:
        _received(store, notice_id, viewer)["read"] = True
        return {"ok": True}

    @app.get(f"{API}/crew/report/notices/{{notice_id}}/report.html", response_class=HTMLResponse, tags=["report"])
    def notice_html(notice_id: int, viewer: str = "engineer", store: service.Store = Session) -> str:
        return render_crew_html(_received(store, notice_id, viewer)["report"])  # type: ignore[arg-type]

    # ------------------------------------------------------------ demo
    @app.post(f"{API}/demo/reset", tags=["meta"])
    def reset_demo(store: service.Store = Session) -> dict[str, bool]:
        store.reset()
        return {"ok": True}

    # The built frontend, if there is one. Without it this is an API-only server, which is
    # all a backend developer needs (use /api/v1/docs to exercise it).
    if config.FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="frontend")
    return app


app = create_app()
