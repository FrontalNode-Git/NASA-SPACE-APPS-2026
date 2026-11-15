# VITAL

**Your normal, not Earth's normal.** A health check-in dashboard for a crew on a long space
mission. Each crew member enters their daily vitals, and VITAL compares every reading with
that person's own pre-flight baseline instead of a population range.

Team ACG DSA · NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for
Astronauts on Space Missions*.

> All readings in the app are **simulated**. The four crew roles carry the names of our team
> members; none of the readings are theirs. The alert method is
> labelled **provisional**. VITAL is not a medical device and gives no diagnosis.

## What it does

- **Personal baseline.** Seven pre-flight readings per crew member set "your normal" for each indicator.
- **Daily check-in.** Resting heart rate, blood oxygen, body temperature, sleep, exercise and mood.
- **Drift detection.** Every reading is compared with that personal normal, and two trend detectors
  (EWMA and CUSUM) catch slow changes a single reading would miss.
- **Clear status.** Nominal ●, Watch ▲ or Call ground ■, always with a colour, a shape, a word and a reason.
- **Body scan and Hazard Lens.** An interactive figure whose body zones follow the statuses, and a lens
  that shows how NASA's five spaceflight hazards relate to the body.
- **Crew view and reports.** The crew view lists everyone's status, most urgent first; each crew
  member has a daily report for ground, and the medical officer gets one report for the whole crew
  and can send it to the Commander.
- **Mission timeline.** A simulated 1,095-day Mars mission across its phases and environments.

---

## Run it

You need **Python 3.11 or newer** and **Node.js 22** (with npm). Nothing else: no database,
no Docker, no accounts, no internet connection once the packages are installed.

### The short way: one script

From the top folder of the project:

```bash
node start.mjs
```

On Windows you can double-click **start.cmd** instead. The script installs what is missing,
builds the interface when it is missing or out of date, starts the server and opens
**http://localhost:7860**. The first run takes a few minutes and needs internet; later runs
take seconds. `Ctrl+C` stops it.

| Option          | What it does                                              |
| --------------- | --------------------------------------------------------- |
| `--tour`      | Opens straight into the guided walkthrough                |
| `--build`     | Rebuilds the interface first, even if it looks up to date |
| `--port 8000` | Uses another port                                         |
| `--lan`       | Also reachable from other devices on the same Wi-Fi       |
| `--no-open`   | Does not open the browser                                 |

If Python is installed somewhere unusual, set `VITAL_PYTHON` to the full path of `python`.
The three steps below do the same by hand.

### 1. Build the interface (once, and again after any frontend change)

```bash
cd frontend
npm ci
npm run build
```

### 2. Start the server

It serves the API and the interface you just built, on one address.

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 7860
```

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 7860
```

The first two lines of each block are only needed the first time. If Windows does not know
`python`, try `py` instead.

### 3. Open it

**http://localhost:7860**

Leave the terminal open while you use the app. `Ctrl+C` stops it.

---

## View it

| Where                               | What you see                                        |
| ----------------------------------- | --------------------------------------------------- |
| http://localhost:7860               | The app                                             |
| http://localhost:7860/api/v1/docs   | Every API route, with a "Try it out" button         |
| http://localhost:7860/api/v1/health | `{"status":"ok", ...}` when the server is healthy |

### A two-minute look around

The app opens on **mission day 20**, signed in as the **Flight Engineer**, in the scripted
demo scenario.

1. **Dashboard.** The *Check-in* panel is where readings are entered. Type a heart rate and
   press *Save check-in*: the card, the status in the header and the body scan follow what
   you typed. Clear the field and save again to go back to the simulated value.
2. **‹ Mission day ›** in the header steps through days. Day 8 is a quiet day; on day 20 the
   resting heart rate has been drifting for five days and the status is *Watch*.
3. **Signed in as** switches crew member. As the Chief Medical Officer, open **Crew**: the
   most urgent person comes first, and mood and notes stay private to their owner.
4. **Report for ground** is the day's summary, ready to copy or print. Signed in as the
   Chief Medical Officer it covers the whole crew in one report, without the other members'
   mood values and notes, and **Notify the Commander** sends it to the Commander.
5. **Presenter mode** (press `P`) walks through the whole story in ten steps. **Judge
   drawer** (`J`) jumps to any day and switches scenario. Their two header buttons show only
   when the address ends in `?tour` or `?demo`, so a plain link is the crew tool by itself.
6. *Reset demo* (in Presenter mode or the Judge drawer) puts everything back.

Statuses always use a colour, a shape and a word: Nominal ●, Watch ▲, Call ground ■.

Adding `?tour` to the address (http://localhost:7860/?tour) opens the app straight into
Presenter mode. Use that form when you send the app to someone as a link.

### See it on a phone or a second laptop

Start the server with `--host 0.0.0.0` added, then open `http://<your computer's IP>:7860`
from a device on the same Wi-Fi. Your firewall may ask for permission the first time.

---

## Work on it

The repository is split so that each person only needs their own half.

| Folder                | What lives there                                                           | You need      |
| --------------------- | -------------------------------------------------------------------------- | ------------- |
| [backend/](backend/)   | FastAPI service: baseline and drift maths, check-ins, crew privacy, report | Python        |
| [frontend/](frontend/) | React + TypeScript interface                                               | Node.js       |
| [data/](data/)         | The content both halves read (`sources/` and `app/model.json`)         | a text editor |
| [docs/](docs/)         | The list of sources behind every health statement                          | —            |

The two halves meet in one place: the JSON the API returns. Its shape is pinned by
[backend/tests/test_contract.py](backend/tests/test_contract.py) and mirrored in
[frontend/src/lib/types.ts](frontend/src/lib/types.ts). Change one, change the other.

### Live reload while developing (two terminals)

```bash
# terminal 1, in backend/  (Windows: .venv\Scripts\python instead of .venv/bin/python)
.venv/bin/python -m uvicorn app.main:app --port 7860 --reload

# terminal 2, in frontend/
npm run dev
```

Then open **http://localhost:5173**. Interface changes appear at once, and calls to `/api`
are passed on to the server on port 7860.

Backend only? Skip the frontend entirely and use http://localhost:7860/api/v1/docs.

### Tests

```bash
# backend, in backend/
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest

# frontend, in frontend/
npm run typecheck
npm test

# end to end, in frontend/, with the app running on port 7860
npx playwright install chromium     # once
npm run e2e
```

To run the end-to-end tests with a browser you already have, name it first:
`$env:PW_CHANNEL = 'msedge'` in PowerShell, or `PW_CHANNEL=msedge npm run e2e` elsewhere
(`chrome` works the same way).

The same checks run on every push, in [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## Good to know

- **Entries live in memory.** What you type is kept per browser and is gone when the server
  restarts. Run a single server process.
- **Build before you start.** The server looks for `frontend/dist` when it starts. If you
  build afterwards, restart it.
- **Health statements come from data, never from code.** Every statement the app shows is in
  [data/sources/](data/sources/) and traces to a NASA or Canadian Space Agency page. The app
  does not show the sources; the full list is [docs/SOURCES.txt](docs/SOURCES.txt). Places
  still waiting for a sourced fact show *Planned · Not in this version yet*.
- **Privacy.** Mood values, notes, personal reports and pre-flight calibration are visible only to the
  crew member they belong to. For mood, everyone else, including the medical officer, sees only a
  status level; the other readings are shown in the crew view.
- **NASA API key.** Not needed today: it is only for the live space-weather module, which is off. When
  that module is approved, copy `backend/.env.example` to `backend/.env` and put the key after
  `NASA_API_KEY=`. Never commit `.env`.
- **Optional modules are off.** The four flags in [backend/.env.example](backend/.env.example)
  stay `false` until the team approves live data. In the app they are listed on the *Planned
  next* screen, without the flag names.

## If something looks wrong

| You see                                             | Cause                                               | Fix                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `{"detail":"Not Found"}` at http://localhost:7860 | The interface was not built when the server started | `npm run build` in `frontend/`, then restart the server                                                    |
| "VITAL could not reach its data service."           | The server is not running                           | Start it (step 2) and press *Try again*                                                                      |
| Old screens after a frontend change                 | You are looking at the last build                   | `npm run build` again, or use `npm run dev`                                                                |
| `address already in use`                          | Something else is on port 7860                      | Stop it, or pick another `--port` (for `npm run dev`, set `API_TARGET=http://127.0.0.1:<port>` to match) |
| Numbers that make no sense after experimenting      | Entries you typed earlier are still stored          | *Reset demo*                                                                                                 |

## Use of AI

We used Claude (Anthropic) as an assistant for coding, debugging and fact-checking. The team chose the challenge, the concept, the indicators and the sources. Each change was reviewed by our team. All health content comes from NASA and Canadian Space Agency pages (see [docs/SOURCES.txt](docs/SOURCES.txt)), not from AI.

## Credits

Health content: NASA Human Research Program and Canadian Space Agency public pages, listed in
[docs/SOURCES.txt](docs/SOURCES.txt). VITAL is not affiliated with or endorsed by NASA or the CSA.

Interface icons: "Health and Wellness Icons" by Mycogen, used under an Envato Elements licence held by FrontalNode (details in [frontend/src/assets/icons/README.txt](frontend/src/assets/icons/README.txt)). The search, microphone and timeline icons were drawn for VITAL.

## Licence

VITAL is released under the [MIT License](LICENSE). The interface icons in [frontend/src/assets/icons/](frontend/src/assets/icons/) are third-party and are not covered by it (see Credits above).
