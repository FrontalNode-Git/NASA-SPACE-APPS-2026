# TODO

Everything that is still open in VITA-L, by team. Tick an item when its "Done when" is true
and the tests pass. How to run the app and the tests: [README.md](README.md).

- **↔** means the item changes the JSON between the two halves. Whoever picks it up updates
  [backend/tests/test_contract.py](backend/tests/test_contract.py) and
  [frontend/src/lib/types.ts](frontend/src/lib/types.ts) in the same change and tells the
  other team.
- Feature freeze is **Sunday 15 November, 12:00** (judging at 17:00, Athens time). Items
  under "Small" are safe before the freeze. Items under "Larger" are for after it, or need a
  clear owner and a test before they go in.
- Two rules that every item must keep: no health statement or health number may be written
  in code (they come from [data/sources/](data/sources/) only), and all simulated data stays
  labelled as simulated.

The numbers quoted below were measured on the current code on 14 November.

---

## Backend

Code: [backend/app/](backend/app/) · tests: [backend/tests/](backend/tests/) · run
`python -m pytest` in `backend/` (56 tests pass today).

### Small

- [ ] **Ask "who is looking?" on every crew-member route** ↔
  The dashboard and crew routes hide mood and notes from everyone but their owner. The report
  and calibration routes never ask: `GET /api/v1/members/engineer/report` returns the
  engineer's notes and mood to any caller, `GET .../calibration` returns their pre-flight
  mood values, and `DELETE .../calibration` works for any viewer.
  *Where:* the report and calibration routes in [backend/app/main.py](backend/app/main.py);
  [backend/app/report.py](backend/app/report.py) builds the report as the owner.
  *Done when:* those four routes take `viewer` like the others and refuse (403) or redact for
  anyone but the owner, with tests next to the privacy tests in
  [backend/tests/test_crew.py](backend/tests/test_crew.py). The frontend then has to send
  `viewer` on those calls (see Frontend).
- [ ] **Pin the dependency versions**
  [backend/requirements.txt](backend/requirements.txt) allows ranges, so a package released
  on Sunday morning could break a fresh install just before judging.
  *Done when:* installs are reproducible (exact versions, or a constraints file made with
  `pip freeze`), and CI uses the same file. While there: the test client prints a Starlette
  deprecation warning about `httpx`; read the Starlette release notes and decide what to pin.
- [ ] **Send less in the content bundle** ↔
  `GET /api/v1/content/bundle` is 59.7 KB and is not compressed. It carries `research`,
  `coverage`, `features`, `slots` and `pending`, which no screen reads any more, and four
  citation fields on every fact (`url`, `quote`, `page_title`, `fetched_at`) that the app is
  not allowed to show.
  *Where:* `Content.bundle()` in [backend/app/content.py](backend/app/content.py); app setup
  in [backend/app/main.py](backend/app/main.py).
  *Done when:* responses are gzip-compressed, the bundle only carries what the interface
  uses, and `test_content_bundle` in the contract test matches. The citation fields stay in
  the data files and in [docs/SOURCES.txt](docs/SOURCES.txt).
- [ ] **Limit how many notes are kept and returned**
  Notes are unlimited: 2,000 of them make one dashboard response 749 KB.
  *Where:* `Store.add_log` and `Store.logs_for` in
  [backend/app/service.py](backend/app/service.py).
  *Done when:* there is a cap per crew member, the dashboard returns the newest ones only,
  and a test covers it.
- [ ] **One list of crew members and indicators**
  The crew is defined in [data/app/model.json](data/app/model.json) and again in
  `PROFILES` in [backend/app/simulator.py](backend/app/simulator.py) and in `SIM_NOTES` /
  `SIM_CHECKINS` in [backend/app/service.py](backend/app/service.py). Adding a person or an
  indicator in one place only gives a server error. The mission length is also written twice
  (`MAX_DAY` and `mission.total_days`).
  *Done when:* a test (or `Content.validate()`) fails with a clear message when they disagree.
- [ ] **Lint and type-check the backend in CI**
  There is no linter or type checker, and the service code returns `dict[str, object]` with
  many `# type: ignore` comments.
  *Done when:* a linter and a type checker run in the backend job of
  [.github/workflows/ci.yml](.github/workflows/ci.yml) and pass.

### Larger

- [ ] **Keep entries when the server restarts**
  All check-ins, notes and calibrations live in memory, one `Store` per browser session, at
  most 300 sessions. A restart loses everything, and the server must run as a single process.
  *Where:* `Store` in [backend/app/service.py](backend/app/service.py); `get_store` in
  [backend/app/main.py](backend/app/main.py).
  *Done when:* entries survive a restart (SQLite from the standard library is enough), the
  existing tests still pass, and a new test restarts the app and reads an entry back.
- [ ] **Real sign-in** ↔
  `viewer` is a query parameter that the caller chooses, so the privacy rule depends on
  honesty. The header's "Signed in as" menu is a role switch, not a login.
  *Done when:* the server works out who the viewer is from a sign-in (a PIN or token per crew
  member is enough), no route trusts a `viewer` sent by the client, and the demo can still
  switch roles quickly.
- [ ] **Give the server a mission clock** ↔
  The server does not know what day it is. It accepts a check-in for mission day 900 while
  the crew is on day 20, and a note's time is the server's local clock with no date.
  *Where:* `save_readings` and `Store.add_log` in
  [backend/app/service.py](backend/app/service.py).
  *Done when:* there is a mission start date, entries for future days are refused, entries
  carry a full timestamp, and the demo can still jump between days.
- [ ] **Ask before accepting an unlikely entry** ↔
  A slip of the keyboard becomes an alarm: typing a heart rate of 600 instead of 60 is saved
  and shows *Call ground*. Today the server only refuses what a field cannot hold (see
  `INPUT_LIMITS` in [backend/app/service.py](backend/app/service.py)).
  *Done when:* an entry very far from that person's own baseline is answered with "please
  confirm" instead of being saved, and saved once confirmed. Use the personal baseline only;
  do not add population ranges.
- [ ] **Fewer false alerts**
  On the quiet scenario (`nominal`, where nothing happens) 24.1% of crew-days still show
  *Watch* or *Call ground* over the 1,095-day mission. 953 of the 1,200 flagged readings are
  a single value at least two personal standard deviations out; 177 are a drift alone.
  Temperature flags most often (356), probably because it moves in 0.1 steps while a
  personal spread is about 0.14. Every vital is also checked in both directions: in `demo`,
  day 183, a blood-oxygen reading of 100% shows *Call ground* for the medical officer.
  Whether a direction matters for a given vital is a question for a medical reviewer.
  *Where:* thresholds at the top of [backend/app/baseline.py](backend/app/baseline.py),
  `classify` in the same file.
  *Done when:* a script in [backend/scripts/](backend/scripts/) reports the alert rate per
  scenario, a rule change (for example "two of the last three days") lowers it on `nominal`
  without losing the drift in `demo` or the spike in `acute`, and the locked stories in
  [backend/tests/test_baseline.py](backend/tests/test_baseline.py) still pass. The method
  stays labelled provisional.
- [ ] **Accept readings from a device** ↔
  The "sensor" is the simulator. There is no way to send real device data in.
  *Done when:* a route accepts a batch of device readings per crew member and day, a typed
  check-in still wins over a device value, a device value wins over the simulated one, and
  `latest_source` tells the three apart.
- [ ] **Keep a history of what was entered** ↔
  A check-in overwrites the previous value with no record of when or what it replaced, and
  a chart cannot tell typed points from sensor points.
  *Where:* `Store.set_reading` and the `series` built in `indicator_view`, both in
  [backend/app/service.py](backend/app/service.py).
  *Done when:* every change is kept with its time, a route returns the history for a day,
  and each point in `series` says where it came from.
- [ ] **Describe the responses with models**
  The routes return plain dictionaries, so `/api/v1/docs` shows no response shapes and
  `types.ts` is kept in step by hand.
  *Done when:* the dashboard, crew, report and config routes declare response models, the
  contract test still passes unchanged, and `types.ts` can be generated from the API schema.
- [ ] **Make sessions safe under load**
  `get_store` creates and evicts sessions without a lock; a client that sends no session id
  shares one `default` store; 301 new sessions push out the oldest one, even if somebody is
  using it.
  *Where:* `get_store` in [backend/app/main.py](backend/app/main.py).
  *Done when:* creation is locked, sessions expire by idle time rather than by count alone,
  and a test covers concurrent first requests.

### Blocked

- [ ] **Optional modules** (`LIVE_SPACE_WEATHER`, `DISTANCE_ENGINE`, `TRIAGE_PROTOCOLS`,
  `ECLSS_MODELS`): flags and empty screens only. Do not add data or numbers until the team
  lead says "approve live data". See [backend/app/config.py](backend/app/config.py).

---

## Frontend

Code: [frontend/src/](frontend/src/) · run `npm run typecheck`, `npm test` and
`npm run build` in `frontend/` (20 unit tests and 44 end-to-end checks pass today).

### Small

- [ ] **Look at the reworked dashboard on a laptop and a phone**
  The check-in panel, the day stepper in the header and the compact hazard filter pass their
  tests but have not been checked by eye since the rework.
  *Done when:* someone has gone through every screen at 1366×768 and at phone width
  (390×844) and fixed or listed what looks wrong.
- [ ] **Say which check-in value was refused**
  When the server refuses a check-in, the panel shows one general sentence. The server's
  answer names the vital, but `request()` in [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
  throws it away.
  *Where:* [frontend/src/components/CheckIn.tsx](frontend/src/components/CheckIn.tsx).
  *Done when:* the message names the field and that field is marked.
- [ ] **Send `viewer` on report and calibration calls** ↔
  Goes with the first Backend item. *Where:* `report`, `reportHtmlUrl`, `calibration` and
  `clearCalibration` in [frontend/src/lib/api.ts](frontend/src/lib/api.ts).
- [ ] **Remove types the interface no longer uses** ↔
  [frontend/src/lib/types.ts](frontend/src/lib/types.ts) still describes `Study`, `Coverage`,
  `CoverageRow`, `PendingItem` and `Feature`, and the bundle fields `research`, `coverage`,
  `features`, `slots` and `pending`. Do it together with "Send less in the content bundle".
- [ ] **Decide where Presenter mode and the Judge drawer live**
  Both are buttons in the main header of a tool meant for a crew.
  *Done when:* the team has decided whether they stay visible, move behind a key or a link
  such as `?demo`, or go after judging. Keys `P` and `J` already open them.
- [ ] **Keep the session id out of the address bar**
  The printable report is opened with `?session=...` in its address, so the id ends up in
  the browser history. *Where:* `reportHtmlUrl` in
  [frontend/src/lib/api.ts](frontend/src/lib/api.ts) and
  [frontend/src/pages/Report.tsx](frontend/src/pages/Report.tsx).
- [ ] **Show "Saved" after the server has answered**
  Quick log and "I'm OK" show their confirmation first and call the server afterwards
  (`log` in [frontend/src/lib/store.ts](frontend/src/lib/store.ts)). If the call fails, a
  second message corrects the first.

### Larger

- [ ] **Confirm an unlikely entry** ↔
  The screen side of "Ask before accepting an unlikely entry": show the server's question,
  let the crew member confirm or correct.
- [ ] **Mark typed points on the charts** ↔
  Once the backend says where each point came from, draw entered values differently from
  sensor values, in the chart and in its table view
  ([frontend/src/components/Chart.tsx](frontend/src/components/Chart.tsx)).
- [ ] **Follow the mission clock** ↔
  The day stepper moves to any day from 0 to 1,095, including days that have not happened.
  Once the server has a clock, open on "today" and keep free movement for the demo only.
- [ ] **Keep entries when the server cannot be reached**
  A check-in that fails to save is lost; the crew member only sees a message.
  *Done when:* unsent entries are kept in the browser and sent when the server answers again,
  and the screen shows that they are waiting.
- [ ] **Make the first load lighter**
  The main script is 761 kB (254 kB compressed). The 3D body scan is already loaded
  separately (848 kB, only when shown). The build's size warning was raised to 1,200 kB in
  [frontend/vite.config.ts](frontend/vite.config.ts) rather than fixed.
  *Done when:* the chart code is loaded only on screens that draw a chart, and the warning
  limit is back at its default.
- [ ] **Run an accessibility check on every screen**
  Statuses use colour, shape and text, charts have a table view, and everything works from
  the keyboard, but no automated check or screen-reader pass has been done.

---

## Shared: before submitting

- [ ] **Make the v1 commit.** Nothing in this tree is committed or pushed yet (branch
  `develop`). Until it is, nobody else can run or review the app, and CI has never run.
  Watch the first CI run: it uses Python 3.11, and the code has so far only run on 3.13.
- [ ] **Replace the NASA API key.** The key was committed inside `.gitignore` and is on
  GitHub in the current `develop` and in the history. Request a new key at api.nasa.gov,
  keep it only in `backend/.env` (ignored by git), and treat the old one as public.
- [ ] **Choose where the app is hosted.** The Docker files and the deploy workflow were
  removed, so there is no way to deploy yet. Any host that can run
  `pip install -r backend/requirements.txt`, build the frontend and start
  `uvicorn app.main:app` as a single process will do. Until then the demo runs from a laptop.
- [ ] **Write the missing documents.** `docs/API.md` (mentioned in
  [frontend/src/lib/api.ts](frontend/src/lib/api.ts) and the contract test) and
  `docs/RESEARCH_GUIDE.md` (mentioned in [docs/PENDING.md](docs/PENDING.md)) do not exist.
  Neither do `backend/README.md`, `frontend/README.md`, `SUBMISSION.md` or `audit/AUDIT.md`
  (`audit/` is an empty folder, which git does not keep).
- [ ] **Decide what to do with the coverage table.**
  [backend/scripts/export_coverage.py](backend/scripts/export_coverage.py) writes a table of
  NASA risks into the README between two markers. The README has no such markers, so the
  script fails. Add the block to the README or delete the script.
- [ ] **Fill the three *Pending* places** on the Mission screen (communication delay,
  radiation dose rate, pressurized rover). Each needs a sourced fact; see
  [docs/PENDING.md](docs/PENDING.md).
- [ ] **Decide whether judges need to see the sources.** The app shows NASA and Canadian
  Space Agency content without citing it; the list is only in
  [docs/SOURCES.txt](docs/SOURCES.txt). Check the challenge rules and the agencies' reuse
  terms, and link the list from the submission.
- [ ] **Confirm the licence of the icon pack** in
  [frontend/src/assets/icons/](frontend/src/assets/icons/). It came without a licence file.
- [ ] **Submission pieces:** public link, two-minute video, project text. The walkthrough
  and pitch are in [docs/PRESENTERS.md](docs/PRESENTERS.md).
