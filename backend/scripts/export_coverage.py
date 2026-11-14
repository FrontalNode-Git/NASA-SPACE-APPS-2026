"""Keep the risk coverage table in the root README generated from the data, never typed.

Run from backend/ after changing data/ or the indicator links:

    python scripts/export_coverage.py           # rewrite the block in README.md
    python scripts/export_coverage.py --check   # exit 1 if README.md is out of date
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from app.content import load_content  # noqa: E402

README = ROOT / "README.md"
START, END = "<!-- coverage:start -->", "<!-- coverage:end -->"
LABEL = {"monitored": "Monitored", "partial": "Context only", "pending": "Not covered yet"}


def render() -> str:
    content = load_content()
    cov = content.coverage()
    names = {i.id: i.name for i in content.model.indicators}
    lines = [
        f"**VITA-L monitors {cov['monitored']} of NASA's {cov['total']} HRP risks**, gives in-app context "
        f"for {cov['partial']} more, and does not cover {cov['pending']} yet.",
        "",
        "| NASA HRP risk | Coverage | Tracked through |",
        "|---|---|---|",
    ]
    for row in cov["rows"]:
        risk = content.risk_by_id[row["risk_id"]]
        tracked = ", ".join(names[i] for i in row["indicators"]) or "—"
        lines.append(f"| [{risk.name}]({risk.url}) | {LABEL[row['level']]} | {tracked} |")
    return "\n".join(lines)


def apply(readme: str) -> str:
    start = readme.index(START) + len(START)
    end = readme.index(END)
    return f"{readme[:start]}\n{render()}\n{readme[end:]}"


def main() -> int:
    current = README.read_text(encoding="utf-8")
    updated = apply(current)
    if "--check" in sys.argv:
        if current != updated:
            print("README.md coverage table is out of date. Run (in backend/): python scripts/export_coverage.py")
            return 1
        print("README.md coverage table is up to date")
        return 0
    README.write_text(updated, encoding="utf-8", newline="\n")
    print("updated the coverage table in README.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
