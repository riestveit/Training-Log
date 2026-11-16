# Basecamp — training log

A zero-dependency training dashboard for GitHub Pages: running, biking, nordic, BC skiing,
sleep, load, and a journal — all built from `data/training.json`.

## Put it on GitHub (5 minutes)

1. Create a new repo on GitHub (e.g. `training-log`). Public is easiest for Pages.
2. Upload everything in this folder (drag-and-drop on the repo page works), keeping the
   `data/` and `tools/` folders. Include the hidden `.nojekyll` file.
3. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. After ~1 minute your log is at `https://<username>.github.io/training-log/`.

> Public repo = public training data. If you'd rather keep it private, GitHub Pages on a
> private repo needs a paid plan — or just open `index.html` via a local server
> (`python -m http.server` in this folder, then visit http://localhost:8000).

## Logging days

* **+ Log day** (or press `n`) — sleep, each sport's minutes / miles / vert, other minutes,
  sessions, workout, TL, feel (RPF) and notes. Live pace, mph and flat-conversion preview.
* Click any bar, heatmap square, calendar day, journal entry or table row to edit that day.
* Edits save instantly **in your browser**. To make them permanent and visible on every device:

### Sync edits back to the repo
1. Create a **fine-grained personal access token**: GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained → *Only select repositories* → your log repo →
   Permissions → **Contents: Read and write**.
2. In the site's **Data** tab, paste it (owner/repo auto-fill on github.io) and hit
   **Push to GitHub**. It commits `data/training.json`; Pages redeploys in about a minute.
3. On another device: **Pull from GitHub** (or just load the site with no local edits).

The token is stored only in that browser's localStorage. Don't paste it on shared computers.

## Updating from the spreadsheet
If you keep logging in Google Sheets / Excel instead, download it as .xlsx and run:

```
pip install openpyxl
python tools/xlsx_to_json.py Training_Log.xlsx data/training.json
```

then commit the new JSON. CSV import/export is also on the Data tab.

## What's in it
* **Dashboard** — KPIs vs prior period, weekly volume by sport vs goal, this-week ring,
  daily heatmap, sport mix, cumulative miles & vert, monthly totals, personal records.
* **Running** — weekly flat conversion (miles + vert/528), weekly vert, long-run progression,
  steepness-vs-pace bubble chart, distance spread, biggest days table.
* **Load** — fitness/fatigue/form (42/7-day EWMA, minutes or TL), acute:chronic ratio with
  sweet-spot band, daily load, week-over-week ramp, training by weekday.
* **Recovery** — nightly sleep with 7-night average, sleep distribution, sleep vs training,
  feel (RPF), active vs rest days.
* **Calendar** — month grid with per-sport chips, sleep, notes and weekly totals.
* **Journal** — searchable notes timeline.
* Filters: 30D / 90D / 6M / YTD / ALL and per-sport toggles apply everywhere.

## Data format
`data/training.json` is an array of days; omitted fields are zero:
```json
{"date":"2026-11-15","sleep":10,"bc_min":164,"notes":"5 laps of AV"}
```
Fields: `sleep` (hours), `run_min run_mi run_vert`, `bike_*`, `nordic_*`, `bc_*`,
`other_min`, `sessions`, `workout`, `tl`, `rpf`, `notes`.
