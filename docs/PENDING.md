# Pending: waiting for sourced facts

The app shows a `Pending · Awaiting research` placeholder wherever it needs content that is
not yet in `data/sources/facts.json`. Each placeholder disappears by itself on the next
deploy once the matching fact exists. See [RESEARCH_GUIDE.md](RESEARCH_GUIDE.md) for the format.

`pytest tests/test_sources.py` (run in `backend/`) fails if this list falls out of step with the app.

| Pending id | Where it shows | How to resolve |
|---|---|---|
| `distance-comm-delay` | Mission › Communication delay to Earth | Add a fact with this id (a sourced delay figure). |
| `radiation-dose-rate` | Mission › Radiation dose rate per environment | Add a fact with this id. |
| `env-pressurized-rover` | Mission › Pressurized rover environment | Add a fact with this id. |

## Links deliberately left empty

These are not placeholders in the UI, but the Hazard Lens will not highlight them until a
quoted NASA sentence supports the link:

- Risk → hazard: Decompression Sickness, Hypoxia, Spacewalks, SANS, Inadequate Sleep, Dynamic Loads.
- Risk → body zone: Nutrition, Spacewalks, Teamwork, Sleep, Systems Operations Support, Dynamic Loads.

## Optional modules (off by default)

`LIVE_SPACE_WEATHER`, `DISTANCE_ENGINE`, `TRIAGE_PROTOCOLS` and `ECLSS_MODELS` are feature
flags in `backend/app/config.py`. They are scaffolds with Pending screens only: no data, no numbers.
They stay off until the team says "approve live data".
