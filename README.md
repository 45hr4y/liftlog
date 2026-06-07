# LiftLog v9 Sleek

This is a clean rebuild of the workout tracker.

## Verification
When this version runs, the dashboard shows: **LiftLog v9 Sleek**.

## Features
- No big global kg/lb button
- Default unit per machine subtype
- Per-set unit override while logging
- Machine subtypes under exercises
- One photo per machine subtype
- Dropdown/checkbox/text machine settings
- Expanded muscle groups
- Delete exercises, subtypes, routines, and routine exercises
- Routine colour coding
- Calendar with volume per workout
- Mobile-first sleek UI
- Offline local database via IndexedDB

## Run

```bash
npm install
npm run dev
```

Open the local URL on PC or the Network URL on iPhone.


## v5 Update

- Added weekly volume per grouped muscle category.
- Added spider/radar chart in Stats.
- Muscle group buckets:
  - Core = Abs + Obliques
  - Chest = Chest
  - Biceps = Biceps
  - Triceps = Triceps
  - Legs = Hamstrings + Quadriceps + Calves + Glutes
  - Back = Upper Back + Erectors + Lats


## v6 Update

- Added Shoulders to the weekly volume spider chart.
  - Shoulders = Front Delt + Rear Delt + Side Delt
- Added workout summary after finishing a workout.
- Added live workout summary while training:
  - sets
  - total volume
  - exercises
- Added PR-style workout summary cards:
  - best set volume
  - best estimated 1RM


## v7 Update

- Added exercise detail/history page.
- Tap an exercise to view:
  - all-time PRs
  - last 5 sessions
  - best set volume
  - best estimated 1RM
- Added true all-time PR calculations per exercise.
- Added edit mode for exercises.
- Added edit/delete controls for logged sets.
- Added previous-set autofill button while logging.


## v8 Update

- Browser tab title changed to **LiftLog**.
- Added Vercel hosting support.
- Added Local backup settings screen and schema scaffold.
- Added Backup tab.
- Added JSON import backup.
- Added Progress tab:
  - weight trend
  - volume trend
  - subtype filtering
- Added routine duplication.
- Added routine archive.
- Added routine exercise reorder buttons.
- Added more mobile-friendly scrollable bottom navigation.

Important: full automatic cloud sync requires your own Local backup URL/key and should be activated as v9 after auth/conflict handling is added.


## v9 Working Navigation Update

This is the proper working v9 build.

Navigation has been simplified to five bottom tabs:

- Home
- Workout
- Calendar
- Progress
- More

The More page contains:

- Exercises
- Machine Subtypes
- Routines
- Stats
- Backup + Cloud
- Settings

This makes the iPhone interface much cleaner than the crowded v8 navigation.


## v11 Update — Advanced Local Backups

Local backup has been removed to keep LiftLog simpler and fully local-first.

Added:
- Export JSON Backup
- Import JSON Backup
- Local restore points
- Automatic restore point when a workout is finished
- Keeps the latest 20 in-browser restore points
- Restore/download/delete individual snapshots

Recommended workflow:
1. Export JSON Backup weekly.
2. Save the file to iCloud Drive, Google Drive, OneDrive, or email.
3. Import that JSON on another device if needed.
