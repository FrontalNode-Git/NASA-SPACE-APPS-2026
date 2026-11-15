"""Source lock. Run this (from backend/) before committing any change under data/:

    pytest tests/test_sources.py
"""
import json
import re
from pathlib import Path

from app.content import MAX_QUOTE_WORDS, Content, load_content

ROOT = Path(__file__).resolve().parents[2]  # repo root: backend/tests/ -> backend/ -> repo
SEEDS = {
    "https://www.nasa.gov/hrp/hazards/",
    "https://www.nasa.gov/hrp/risks/",
    "https://www.nasa.gov/hrp/ongoing-hrp-research/",
    "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp",
    "https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp",
}


def _rebuild(content: Content, facts=None, model=None) -> Content:
    return Content(
        facts if facts is not None else content.all_facts,
        content.hazards,
        content.risks,
        content.research,
        model if model is not None else content.model,
        content.approved_urls,
    )


def _with_fact(content: Content, **overrides) -> Content:
    bad = content.all_facts[0].model_copy(update=overrides)
    return _rebuild(content, facts=[*content.all_facts, bad])


def test_content_has_no_source_lock_problems(content):
    assert content.validate() == []


def test_approved_urls_are_the_five_seeds_plus_nasa_and_csa_pages():
    approved = json.loads((ROOT / "data/sources/approved_urls.json").read_text(encoding="utf-8"))
    assert set(approved["seeds"]) == SEEDS
    for url in approved["linked"]:
        host = re.match(r"https://([^/]+)", url).group(1)
        assert host.endswith(("nasa.gov", "asc-csa.gc.ca")), url


def test_every_fact_has_the_required_fields_and_a_short_quote(content):
    assert content.all_facts
    for fact in content.all_facts:
        assert fact.id and fact.text and fact.page_title and fact.fetched_at
        assert fact.url in content.approved_urls
        assert len(fact.quote.split()) <= MAX_QUOTE_WORDS, fact.id


def test_validator_fails_on_a_non_approved_url(content):
    tampered = _with_fact(content, id="bad-url", url="https://example.com/space-health")
    assert any("not approved" in p for p in tampered.validate())
    assert "bad-url" not in tampered.facts, "an unapproved fact must never reach the UI"


def test_validator_fails_on_a_long_quote_and_an_unknown_link(content):
    long_quote = _with_fact(content, id="long", quote=" ".join(["word"] * (MAX_QUOTE_WORDS + 1)))
    assert any("quote has" in p for p in long_quote.validate())
    links = content.all_facts[0].links.model_copy(update={"zones": ["tail"]})
    assert any("unknown id 'tail'" in p for p in _with_fact(content, id="x", links=links).validate())


def test_validator_fails_on_a_displayed_number_without_a_fact_id(content):
    model = content.model.model_copy(deep=True)
    model.zones[0].name = "Brain, 86 billion neurons"
    assert any("number without a fact id" in p for p in _rebuild(content, model=model).validate())

    model = content.model.model_copy(deep=True)
    model.mission.basis_fact_ids = []
    assert any("basis_fact_ids" in p for p in _rebuild(content, model=model).validate())


def test_frontend_never_hardcodes_a_source_link():
    """Links to NASA/CSA must flow from facts.json through the content service."""
    offenders = [
        str(path.relative_to(ROOT))
        for path in (ROOT / "frontend" / "src").rglob("*.ts*")
        if re.search(r"nasa\.gov|asc-csa\.gc\.ca", path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_app_shows_content_without_citing_it():
    """Crew tool, not a showcase: no source link, quote or page title is rendered in the UI."""
    offenders = [
        f"{path.relative_to(ROOT)}: {match.group(0)}"
        for path in (ROOT / "frontend" / "src").rglob("*.ts*")
        for match in re.finditer(r"\.(url|quote|page_title|fetched_at)\b|target=\"_blank\"", path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_sources_txt_matches_the_data():
    """With no citations on screen, docs/SOURCES.txt is the record and must stay current."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("export_sources", ROOT / "backend" / "scripts" / "export_sources.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    on_disk = (ROOT / "docs" / "SOURCES.txt").read_text(encoding="utf-8")
    assert on_disk == module.render(), "docs/SOURCES.txt is stale. Run (in backend/): python scripts/export_sources.py"


def test_reload_from_disk_matches(content):
    assert len(load_content().facts) == len(content.facts)
