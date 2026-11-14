"""Typed content service: the single door through which sourced facts reach the UI.

Everything displayed as a fact, number, name or health description comes from
data/sources/*.json. data/app/model.json only wires app structure (indicators, zones,
mission phases) to fact ids. A reference to a fact id that does not exist yet is not an
error: it surfaces as a Pending placeholder until research adds the fact.

The app is a crew tool, so it shows the content without citing it on screen. The record
of where every statement comes from is docs/SOURCES.txt (scripts/export_sources.py).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .config import DATA_DIR

MAX_QUOTE_WORDS = 25
LINK_KINDS = ("indicators", "zones", "hazards", "risks")


class Links(BaseModel):
    indicators: list[str] = Field(default_factory=list)
    zones: list[str] = Field(default_factory=list)
    hazards: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class FactValue(BaseModel):
    number: float
    unit: str


class Fact(BaseModel):
    id: str
    text: str
    quote: str
    url: str
    page_title: str
    fetched_at: str
    links: Links = Field(default_factory=Links)
    value: FactValue | None = None


class Hazard(BaseModel):
    id: str
    short: str
    name: str
    url: str
    fact_ids: list[str]


class Risk(BaseModel):
    id: str
    name: str
    category: Literal["physiology", "behavioral", "radiation"]
    url: str
    fact_id: str
    hazards: list[str] = Field(default_factory=list)
    zones: list[str] = Field(default_factory=list)


class Study(BaseModel):
    id: str
    name: str
    group: Literal["artemis-ii", "leo", "past"]
    url: str
    fact_id: str
    hazards: list[str] = Field(default_factory=list)
    zones: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)


class Indicator(BaseModel):
    id: str
    name: str
    unit: str
    decimals: int
    resolution: float
    zones: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    private: bool = False


class Zone(BaseModel):
    id: str
    name: str
    anchor: tuple[float, float, float]


class Environment(BaseModel):
    id: str
    name: str
    fact_ids: list[str]


class Phase(BaseModel):
    id: str
    name: str
    start: int
    end: int
    environment: str | None = None
    basis_fact_ids: list[str] = Field(default_factory=list)


class Mission(BaseModel):
    name: str
    note: str
    total_days: int
    basis_fact_ids: list[str]
    phases: list[Phase]


class Feature(BaseModel):
    id: str
    name: str
    kind: Literal["measure", "zones", "hazards"]


class Slot(BaseModel):
    id: str
    where: str
    reason: str


class CrewMember(BaseModel):
    id: str
    name: str
    role: str


class AppModel(BaseModel):
    method_status: Literal["provisional", "approved"] = "provisional"
    crew: list[CrewMember]
    indicators: list[Indicator]
    zones: list[Zone]
    environments: list[Environment]
    mission: Mission
    features: list[Feature]
    slots: list[Slot]


class Content:
    """Loaded, cross-linked content with the derived views the UI needs."""

    def __init__(
        self,
        facts: list[Fact],
        hazards: list[Hazard],
        risks: list[Risk],
        research: list[Study],
        model: AppModel,
        approved_urls: set[str],
    ) -> None:
        self.all_facts = facts
        self.approved_urls = approved_urls
        # Source lock, enforced at runtime as well as in tests: an unapproved URL never renders.
        self.facts = {f.id: f for f in facts if f.url in approved_urls}
        self.hazards = hazards
        self.risks = risks
        self.research = research
        self.model = model
        self.risk_by_id = {r.id: r for r in risks}
        self.indicator_by_id = {i.id: i for i in model.indicators}

    # ------------------------------------------------------------------ lookups
    def facts_for(self, kind: str, entity_id: str) -> list[Fact]:
        return [f for f in self.facts.values() if entity_id in getattr(f.links, kind)]

    def phase_for_day(self, day: int) -> Phase:
        for phase in self.model.mission.phases:
            if phase.start <= day <= phase.end:
                return phase
        return self.model.mission.phases[-1]

    # ------------------------------------------------------------------ hazard links
    def _risk_hazards(self, risk_ids: list[str]) -> set[str]:
        out: set[str] = set()
        for rid in risk_ids:
            risk = self.risk_by_id.get(rid)
            if risk:
                out.update(risk.hazards)
        return out

    def hazard_links(self) -> dict[str, dict[str, list[str]]]:
        """Which hazards each entity is linked to. This is what the Hazard Lens filters on."""
        order = [h.id for h in self.hazards]

        def ordered(ids: set[str]) -> list[str]:
            return [h for h in order if h in ids]

        zones: dict[str, list[str]] = {}
        for zone in self.model.zones:
            linked: set[str] = set()
            for fact in self.facts_for("zones", zone.id):
                linked.update(fact.links.hazards)
            linked |= self._risk_hazards([r.id for r in self.risks if zone.id in r.zones])
            zones[zone.id] = ordered(linked)

        environments: dict[str, list[str]] = {}
        for env in self.model.environments:
            linked = set()
            for fid in env.fact_ids:
                if fid in self.facts:
                    linked.update(self.facts[fid].links.hazards)
            environments[env.id] = ordered(linked)

        return {
            "risks": {r.id: ordered(set(r.hazards)) for r in self.risks},
            "studies": {s.id: ordered(set(s.hazards) | self._risk_hazards(s.risks)) for s in self.research},
            "indicators": {i.id: ordered(self._risk_hazards(i.risks)) for i in self.model.indicators},
            "zones": zones,
            "environments": environments,
        }

    # ------------------------------------------------------------------ pending
    def pending(self) -> list[dict[str, str]]:
        """Every place the UI is waiting for a sourced fact."""
        out: list[dict[str, str]] = []
        for slot in self.model.slots:
            if slot.id not in self.facts:
                out.append(
                    {
                        "id": slot.id,
                        "where": slot.where,
                        "reason": slot.reason,
                        "resolve": f'Add a fact with id "{slot.id}" to data/sources/facts.json.',
                    }
                )
        return out

    # ------------------------------------------------------------------ coverage
    def coverage(self) -> dict[str, object]:
        """Risk coverage matrix: every NASA risk against every VITA-L feature, computed from links."""
        rows = []
        monitored = partial = 0
        for risk in self.risks:
            indicators = [i.id for i in self.model.indicators if risk.id in i.risks]
            has = {"measure": bool(indicators), "zones": bool(risk.zones), "hazards": bool(risk.hazards)}
            cells = {}
            for feature in self.model.features:
                if feature.kind == "measure":
                    cells[feature.id] = "monitored" if has["measure"] else "pending"
                else:
                    cells[feature.id] = "partial" if has[feature.kind] else "pending"
            if has["measure"]:
                level = "monitored"
                monitored += 1
            elif has["zones"] or has["hazards"]:
                level = "partial"
                partial += 1
            else:
                level = "pending"
            rows.append({"risk_id": risk.id, "level": level, "indicators": indicators, "cells": cells})
        return {
            "total": len(self.risks),
            "monitored": monitored,
            "partial": partial,
            "pending": len(self.risks) - monitored - partial,
            "rows": rows,
        }

    # ------------------------------------------------------------------ bundle
    def bundle(self) -> dict[str, object]:
        model = self.model.model_dump()
        return {
            "facts": [f.model_dump(exclude_none=True) for f in self.facts.values()],
            "hazards": [h.model_dump() for h in self.hazards],
            "risks": [r.model_dump() for r in self.risks],
            "research": [s.model_dump() for s in self.research],
            **model,
            "hazard_links": self.hazard_links(),
            "pending": self.pending(),
            "coverage": self.coverage(),
        }

    # ------------------------------------------------------------------ validation
    def validate(self) -> list[str]:
        """Source-lock and integrity problems. Empty list means the content is clean."""
        problems: list[str] = []
        seen: set[str] = set()
        zone_ids = {z.id for z in self.model.zones}
        hazard_ids = {h.id for h in self.hazards}
        known = {
            "indicators": set(self.indicator_by_id),
            "zones": zone_ids,
            "hazards": hazard_ids,
            "risks": set(self.risk_by_id),
        }

        for fact in self.all_facts:
            if fact.id in seen:
                problems.append(f"fact {fact.id}: duplicate id")
            seen.add(fact.id)
            if fact.url not in self.approved_urls:
                problems.append(f"fact {fact.id}: URL is not approved: {fact.url}")
            words = len(fact.quote.split())
            if not 1 <= words <= MAX_QUOTE_WORDS:
                problems.append(f"fact {fact.id}: quote has {words} words (limit {MAX_QUOTE_WORDS})")
            if not fact.text.strip() or not fact.page_title.strip():
                problems.append(f"fact {fact.id}: text and page_title are required")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fact.fetched_at):
                problems.append(f"fact {fact.id}: fetched_at must be YYYY-MM-DD")
            for kind in LINK_KINDS:
                for target in getattr(fact.links, kind):
                    if target not in known[kind]:
                        problems.append(f"fact {fact.id}: links.{kind} has unknown id {target!r}")

        def check_url(owner: str, url: str | None) -> None:
            if url is not None and url not in self.approved_urls:
                problems.append(f"{owner}: URL is not approved: {url}")

        def check_refs(owner: str, kind: str, ids: list[str]) -> None:
            for target in ids:
                if target not in known[kind]:
                    problems.append(f"{owner}: unknown {kind[:-1]} {target!r}")

        for hazard in self.hazards:
            check_url(f"hazard {hazard.id}", hazard.url)
            for fid in hazard.fact_ids:
                if fid not in seen:
                    problems.append(f"hazard {hazard.id}: fact {fid!r} does not exist")
        for risk in self.risks:
            check_url(f"risk {risk.id}", risk.url)
            if risk.fact_id not in seen:
                problems.append(f"risk {risk.id}: fact {risk.fact_id!r} does not exist")
            check_refs(f"risk {risk.id}", "hazards", risk.hazards)
            check_refs(f"risk {risk.id}", "zones", risk.zones)
        for study in self.research:
            check_url(f"study {study.id}", study.url)
            if study.fact_id not in seen:
                problems.append(f"study {study.id}: fact {study.fact_id!r} does not exist")
            for kind in LINK_KINDS:
                check_refs(f"study {study.id}", kind, getattr(study, kind))
        for ind in self.model.indicators:
            check_refs(f"indicator {ind.id}", "zones", ind.zones)
            check_refs(f"indicator {ind.id}", "risks", ind.risks)

        # A displayed number must trace to a fact. Mission lengths need a sourced basis...
        mission = self.model.mission
        for owner, basis in [("mission.total_days", mission.basis_fact_ids)] + [
            (f"phase {p.id}", p.basis_fact_ids) for p in mission.phases if p.environment
        ]:
            if not basis or any(fid not in seen for fid in basis):
                problems.append(f"{owner}: numeric value needs existing basis_fact_ids")
        # ...and app-structure labels (which carry no fact id) may not smuggle digits in.
        unsourced_labels = (
            [(f"indicator {i.id}", f"{i.name} {i.unit}") for i in self.model.indicators]
            + [(f"zone {z.id}", z.name) for z in self.model.zones]
            + [(f"environment {e.id}", e.name) for e in self.model.environments]
            + [(f"phase {p.id}", p.name) for p in mission.phases]
            + [(f"feature {f.id}", f.name) for f in self.model.features]
            + [(f"slot {s.id}", f"{s.where} {s.reason}") for s in self.model.slots]
            + [(f"crew {c.id}", f"{c.name} {c.role}") for c in self.model.crew]
            + [("mission", mission.name)]
        )
        for owner, label in unsourced_labels:
            if re.search(r"\d", label):
                problems.append(f"{owner}: label {label!r} shows a number without a fact id")
        return problems


def _read(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_content(data_dir: Path | None = None) -> Content:
    base = Path(data_dir) if data_dir else DATA_DIR
    src = base / "sources"
    approved = _read(src / "approved_urls.json")
    assert isinstance(approved, dict)
    return Content(
        facts=[Fact.model_validate(x) for x in _read(src / "facts.json")],  # type: ignore[union-attr]
        hazards=[Hazard.model_validate(x) for x in _read(src / "hazards.json")],  # type: ignore[union-attr]
        risks=[Risk.model_validate(x) for x in _read(src / "risks.json")],  # type: ignore[union-attr]
        research=[Study.model_validate(x) for x in _read(src / "research.json")],  # type: ignore[union-attr]
        model=AppModel.model_validate(_read(base / "app" / "model.json")),
        approved_urls=set(approved["seeds"]) | set(approved["linked"]),
    )


_cache: tuple[tuple[float, ...], Content] | None = None


def get_content() -> Content:
    """Cached content that reloads itself whenever a data file changes on disk."""
    global _cache
    files = sorted((DATA_DIR / "sources").glob("*.json")) + [DATA_DIR / "app" / "model.json"]
    stamp = tuple(f.stat().st_mtime for f in files)
    if _cache is None or _cache[0] != stamp:
        _cache = (stamp, load_content())
    return _cache[1]
