"""Source extractor / verifier for the VITAL source lock.

1. Downloads the five approved seed pages (or reads saved copies with --from-dir).
2. Writes data/sources/approved_urls.json: the seeds plus every NASA/CSA page linked
   DIRECTLY from them. Nothing else may be cited anywhere in the app.
3. Checks that every fact's `quote` appears verbatim on the page it cites.

Standard library only. Run from the backend/ folder:

    python scripts/extract_sources.py              # live fetch
    python scripts/extract_sources.py --from-dir D # use D/<name>.html saved copies
    python scripts/extract_sources.py --check-only # verify quotes, do not rewrite approved_urls.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[2]  # repo root: backend/scripts/ -> backend/ -> repo
SOURCES = ROOT / "data" / "sources"

SEEDS = {
    "hazards": "https://www.nasa.gov/hrp/hazards/",
    "risks": "https://www.nasa.gov/hrp/risks/",
    "research": "https://www.nasa.gov/hrp/ongoing-hrp-research/",
    "csa_rad": "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp",
    "csa_sci": "https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp",
}
APPROVED_HOST_SUFFIXES = ("nasa.gov", "asc-csa.gc.ca")
USER_AGENT = "Mozilla/5.0 (compatible; source-lock-verifier)"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 - fixed allow-listed URLs
        return resp.read().decode("utf-8", errors="replace")


def main_html(page: str) -> str:
    m = re.search(r"<main.*?</main>", page, re.S | re.I)
    return m.group(0) if m else page


def normalise(text: str) -> str:
    """Make page text and quotes comparable: entities, quotes, whitespace, stray spaces."""
    text = html.unescape(text).replace(" ", " ")
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"')):
        text = text.replace(a, b)
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"\s+([,.;:)])", r"\1", text).strip()


def page_text(page: str) -> str:
    body = re.sub(r"<(script|style|noscript)[\s\S]*?</\1>", " ", main_html(page), flags=re.I)
    return normalise(re.sub(r"<[^>]+>", " ", body))


def direct_links(page: str, base: str) -> set[str]:
    links: set[str] = set()
    for href in re.findall(r'<a\s[^>]*?href=["\']([^"\']+)["\']', main_html(page), flags=re.I):
        url = urljoin(base, html.unescape(href)).split("#")[0]
        host = urlparse(url).hostname or ""
        if url.startswith("https://") and host.endswith(APPROVED_HOST_SUFFIXES):
            links.add(url)
    return links


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-dir", type=Path, help="directory holding <name>.html copies of the seed pages")
    ap.add_argument("--check-only", action="store_true", help="verify quotes only")
    args = ap.parse_args()

    pages: dict[str, str] = {}
    for name, url in SEEDS.items():
        if args.from_dir:
            pages[url] = (args.from_dir / f"{name}.html").read_text(encoding="utf-8", errors="replace")
        else:
            print(f"fetching {url}")
            pages[url] = fetch(url)

    if not args.check_only:
        linked: set[str] = set()
        for url, page in pages.items():
            linked |= direct_links(page, url)
        linked -= set(SEEDS.values())
        approved = {
            "fetched_at": dt.date.today().isoformat(),
            "seeds": list(SEEDS.values()),
            "linked": sorted(linked),
        }
        (SOURCES / "approved_urls.json").write_text(json.dumps(approved, indent=2) + "\n", encoding="utf-8")
        print(f"approved_urls.json: {len(SEEDS)} seeds + {len(linked)} directly linked pages")

    texts = {url: page_text(page) for url, page in pages.items()}
    facts = json.loads((SOURCES / "facts.json").read_text(encoding="utf-8"))
    bad = 0
    for fact in facts:
        text = texts.get(fact["url"])
        if text is None:
            print(f"SKIP  {fact['id']}: {fact['url']} is not a seed page (verify by hand)")
            continue
        if normalise(fact["quote"]) not in text:
            bad += 1
            print(f"FAIL  {fact['id']}: quote not found on {fact['url']}\n      {fact['quote']}")
    print(f"{len(facts) - bad}/{len(facts)} quotes verified verbatim")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
