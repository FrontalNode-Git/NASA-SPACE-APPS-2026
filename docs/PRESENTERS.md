# Presenting VITAL

For whoever demos or pitches VITAL. You do not need to know the code. Starting the app is in
the [README](../README.md); this page is what to click, what to say and what to avoid.

**The one idea to land:** *Your normal, not Earth's normal.* On a long mission the useful
question is not "is this value normal for a human?" but "is this value normal for **this
person**?". VITAL learns each crew member's own baseline before launch and compares every
reading with it.

---

## If the app was sent to you as a link

Nothing to install: open the link in Edge, Chrome, Firefox or Safari, on a laptop or a phone.

- **Add `?tour` to the end of the link** (for example `https://<the address>/?tour`) and the
  app opens straight into the guided walkthrough below, at step 1. Send that version to
  anyone who will look at the app without one of us there. The plain link opens the app itself.
- **Each browser gets its own copy of the demo.** What you type is not seen by anyone else
  who has the link, and their entries do not appear on your screen.
- **Reset demo** (press `J`, or the button in Presenter mode) puts your copy back to the start.
- Entries are kept while the server is running. If it is restarted they are gone, so do not
  rely on something you typed yesterday still being there.
- For a recording, open the `?tour` link, press **Auto-play** and read the captions aloud:
  ten steps, two minutes.

---

## Five minutes before

1. Open the link you were sent. If you are running the app on your own laptop instead, start
   it and open **http://localhost:7860** (steps in the [README](../README.md)).
2. Press `F11` for full screen. Keep the zoom at 100%, or 110% on a projector.
3. Press `J`, then **Reset demo**. Close the drawer with `Esc`.
4. Check the header. It must show **Watch ▲**, **Mission day 20** and **Signed in as Flight
   Engineer**. If it does not, press **Reset demo** again.
5. Close other tabs and silence notifications. Run from your own laptop, the app needs no
   internet; opened from a link, it needs the connection to that link.

Keyboard shortcuts do nothing while the cursor is inside a text field. Click an empty part
of the page first.

---

## The two-minute walkthrough

Press `P`. (The **Presenter mode** and **Judge drawer** buttons are in the header only when
the address ends in `?tour` or `?demo`; the keys work on any link, and on a phone both are
under **Find**.) A caption bar appears at the bottom with
**Next**, **Back**, **Auto-play** and **Reset demo**. Each step moves the app to the right
screen for you. **Auto-play** advances every 12 seconds, which makes the ten steps exactly
two minutes. The caption on screen is a safe sentence to say aloud; the right-hand column
below adds the detail worth pointing at.

| # | The app shows | Point at / say |
|---|---|---|
| 1 | **Calibrate baseline**, before launch | "A week of this person's own readings sets their normal. We never compare with a population range." |
| 2 | **Dashboard**, day 8, the Check-in panel | "Every day starts here. The crew member confirms what the sensors read or types their own values." |
| 3 | Day 8, blood oxygen card | "A quiet day. Every vital is inside this person's own band: Nominal, a circle." |
| 4 | Day 20, resting heart rate card | "63 beats per minute. Their normal is 58.7 give or take 2.5, so no single reading looks alarming. But the trend line has been outside the band for five days." |
| 5 | Day 20, heart zone lit on the body scan (it beats at the 63 bpm on screen) | "So the status is Watch: a triangle, on the card, in the header and on the body. Colour, shape and word, never colour alone." |
| 6 | "I'm OK" saved | "One key, K, tells ground 'I'm OK'. It goes on the record at once." |
| 7 | **Report for ground** | "The day in one page: statuses, the drift, the notes, the related NASA risks. Copy it or print it." |
| 8 | Dashboard with the **Gravity** filter on | "The hazard filter. Choose Gravity and everything not linked to it dims." |
| 9 | **Mission timeline**, Mars surface (day 183) | "On the surface the environment changes and gravity becomes the hazard to watch." |
| 10 | **Crew**, signed in as Chief Medical Officer | "The medical officer sees the whole crew, most urgent first. Mood and personal notes stay private to their owner." |

Finish by pressing **Reset demo** so the next run starts clean.

### What is on screen on day 20 (so nothing surprises you)

| Crew member | Status | Why |
|---|---|---|
| Systems Officer P. Kotsomitopoulos | **Call ground ■** | Slept 5.6 h; own normal is 7.4 ± 0.5 |
| Flight Engineer G. Kiousopoulos | **Watch ▲** | Resting heart rate drifting above own normal for 5 days (63 bpm against 58.7 ± 2.5) |
| Commander S. Sinnis | Nominal ● | — |
| Chief Medical Officer R. Falelaki | Nominal ● | Temperature reading is missing today, so the card asks for it |

On the engineer's heart-rate card, the line "Two detectors agree" means two independent
trend methods both flag the drift. The drift is first flagged on day 16 and has cleared by
day 34.

---

## The hands-on moment (30 seconds, optional)

This shows that VITAL is something the crew **types into**, not something they read. Do it
after the walkthrough, on day 20, signed in as the Flight Engineer.

1. In **Check-in**, change *Resting heart rate* to `75` and press **Save check-in**.
2. The card now says **75 · entered by you**, and the status jumps to **Call ground ■**, in
   the header and on the body scan too. "75 is unremarkable for most people. For this
   person it is far outside their normal."
3. Clear the field and press **Save check-in** again. The sensor value (63) returns.

A second option: open **Crew** and look at *Same reading, four normals*. The Flight Engineer's
63 bpm is placed on everyone's own band: 1.7 spreads above their own normal, but 3.4 above the
Commander's and 1.2 below the Systems Officer's. Drag the slider, or pick another vital, and
every row follows. It is the whole idea of the app in one picture.

A third option: sign in as **Chief Medical Officer**. The temperature field is empty
because the sensor missed it. Type `36.7`, save, and the reminder disappears.

A fourth option: sign in as **Chief Medical Officer** and open **Report for ground**. It opens
on *Whole crew*: all four crew members in one report, ready to copy or print. Mood values and
notes of the other three are not in it. Press **Notify the Commander**, then sign in as
**Commander**: a notice at the top of every screen says the medical officer sent the crew
report, and **Open report** shows it. *My report* switches back to the person's own.

**Always undo what you typed, or press Reset demo.** A value left in place stays in the
chart and changes the trend on later days, so the walkthrough will no longer match this page.

---

## Three-minute pitch

Every health statement below comes from NASA's Human Research Program or the Canadian Space
Agency. Keep the wording close; do not add numbers of your own.

**The problem (40 s).** NASA's Human Research Program names five hazards of human
spaceflight: space radiation, isolation and confinement, distance from Earth, gravity, and
closed or hostile environments. They do not stand alone; they can feed off one another. On
a Mars mission, astronauts would leave our planet for roughly three years. Mars is, on
average, 140 million miles from Earth. Instructions, supplies and medical care become
increasingly challenging to receive, and the Canadian Space Agency adds that such missions
mean increased delays in communication with Earth and less ability to rely on Earth for
emergency medical assistance. In NASA's words, planning and self-sufficiency will be key.

**The idea (30 s).** A crew that far away has to notice change by itself, early. NASA says
astronauts' entire bodies must adjust to the new gravities they encounter. Our premise, and
it is ours, not NASA's: for a body that is adapting, the most useful comparison is with the
same person before launch. So VITAL uses each person as their own ruler. *Your normal, not
Earth's normal.*

**The demo (90 s).** Run the walkthrough above. If time is short, show steps 2, 4, 5 and 10.

**What it is, honestly (20 s).** The readings are simulated. The four crew roles carry our own
names, and none of the numbers are ours; every screen marks the data as simulated. The alert rules are plain statistics against a personal baseline and are
labelled provisional. VITAL flags a change and tells the crew to call ground. It does not
diagnose.

**Close (10 s).** "Six vitals, four crew members, one question asked every day: is this
normal for *you*?"

For the two-minute video, record Presenter mode on **Auto-play** and read the captions.

---

## Questions you may get

**Is this real astronaut data?**
No. All readings are simulated. The four crew members carry the names of our team, and none
of the numbers are real. The app labels the data as simulated on every screen and in the report.

**Where do the health statements come from?**
From three NASA Human Research Program pages (hazards, risks, ongoing research) and two
Canadian Space Agency pages. Each of the 75 statements is tied to a quoted sentence on its
page. The full list is [docs/SOURCES.txt](SOURCES.txt). The app does not display sources,
because it is a tool for the crew, not a reading room.

**How do you decide Watch and Call ground?**
From the person's own pre-flight week we take their average and spread. A reading two
spreads away is Watch; three is Call ground. A slow trend that stays outside the band is
also Watch, even when no single reading is far out. That is the heart-rate story.

**Why no medical thresholds?**
We chose not to invent health numbers. Everything is relative to the individual, and the
method is labelled provisional until medical experts review it.

**How often does it raise a false alarm?**
Often, and we say so. In our quiet simulated scenario about one crew-day in four shows a
Watch or Call ground, mostly from a single reading. Reducing that is the first item on our
method list. It is the reason the method carries a "provisional" label.

**What does "Call ground" mean?**
The reading is very far from that person's normal. It is a prompt to contact the flight
surgeon, not a diagnosis.

**Who can see what?**
Mood and personal notes are visible only to their owner. Everyone else, including the
Chief Medical Officer, sees the status level. The Chief Medical Officer can get one report
for ground that covers the whole crew, and can send it to the Commander. The same rule holds
in both copies: mood values and notes of anyone but the reader are left out, so the
Commander's copy does not carry the medical officer's notes either. In this demo "Signed in as" is a role switch; a real sign-in is on our list.

**Does it need a connection to Earth?**
No. It runs as one small service next to the crew, and the app itself calls nothing
outside (voice input is the one part that depends on the browser). The report for ground
is a page you copy or print, to send when a link is available.

**What if the app cannot reach its server when I save?**
Nothing is lost. The entry is kept in the browser, the screen says "Waiting to send", and it
is sent by itself when the server answers again. "Saved" only appears once the server has it.

**What happens to entries if it restarts?**
Today they are lost: entries are kept in memory. Saving them permanently is on our list.

**How much of NASA's risk list does it touch?**
NASA lists 17 risks on the page we used. Five are linked to a vital the crew enters. Ten
more are linked to a body zone or a hazard in the app. Two are not covered yet.

**What would you build next?**
See [TODO.md](../TODO.md): saved entries, real sign-in, readings straight from devices,
fewer false alerts.

---

## Say / do not say

| Say | Do not say |
|---|---|
| "simulated data", "our names, simulated readings" | "real astronaut data", "our own health data" |
| "flags a change", "prompts a call to ground" | "diagnoses", "detects illness" |
| "provisional method" | "clinically validated", "NASA-approved" |
| "based on NASA and CSA public pages" | "built with NASA", "endorsed by NASA" |
| the numbers on this page | any health number that is not on this page or on screen |

---

## If something goes wrong

| Problem | Do this |
|---|---|
| The screen does not match this page | `J` → **Reset demo** |
| "VITAL could not reach its data service." | The server stopped. Restart it ([README](../README.md)), then **Try again** |
| The body scan is slow or blank | Press **Flat view** on the body scan panel |
| A key does nothing | Click an empty part of the page, then press it again |
| A judge moves to a random day and sees an alert you cannot explain | "That is a chance reading outside this person's band. It is why we call the method provisional." Then go back to day 20 |
| Voice input does not respond | Skip it. It depends on the browser and the microphone; every voice command also has a key |

Keep to days **0, 8 and 20**, plus **183** for the Mission screen. On every other day some
vital is flagged by chance (on day 183 the header shows Watch because of a short night, not
the heart rate), and you will be explaining noise instead of the story.

---

## Cheat sheet

| Key | Does |
|---|---|
| `P` | Presenter mode on / off |
| `J` | Judge drawer: any mission day, three scenarios, Reset demo |
| `K` | "I'm OK" |
| `L` | Quick log: a mood, any number of entries and a short note, then **Save** |
| `R` | Report for ground |
| `H` | Hazard filter: jump to it, or clear it |
| `Shift`+`1`…`5` | Radiation, Isolation, Distance, Gravity, Hostile environment |
| `/` | Search everything |
| `N` | Night mode |
| `T` | Play / pause the mission timeline (the day moves on by itself; `×1`, `×4`, `×16` set the speed) |
| `Esc` | Close whatever is open |

**Scenarios in the Judge drawer**

| Scenario | What it shows on day 20 |
|---|---|
| `demo` | The story on this page |
| `nominal` | A quiet mission: everyone Nominal |
| `acute` | A sudden far-out temperature reading for the Flight Engineer: Call ground |
