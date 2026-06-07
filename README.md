# LiftLog v10 Sleek

This is a clean rebuild of the workout tracker.

## Verification
When this version runs, the dashboard shows: **LiftLog v10 Sleek**.

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
- Added Supabase settings screen and schema scaffold.
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

Important: full automatic cloud sync requires your own Supabase URL/key and should be activated as v9 after auth/conflict handling is added.


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


## v10 Update — Manual Supabase Sync

This version adds real manual cloud sync:

- Upload this device to cloud
- Download cloud to this device
- Use the same private sync code on PC and iPhone
- Syncs:
  - settings
  - exercises
  - subtypes
  - routines
  - routine exercises
  - workouts
  - sets

Photos stored as browser Blobs may not reliably sync across devices yet. Proper photo sync should be a future Supabase Storage feature.

## Setup

Run `supabase-schema.sql` inside Supabase SQL Editor, then paste your Supabase Project URL and anon key into LiftLog → More → Backup + Cloud.


## v10.1 Fix

This patch fixes the Vercel TypeScript build errors from v10:
- Dexie transaction overload error
- CloudConfig literal type issue
