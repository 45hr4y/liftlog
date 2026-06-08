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


## v11.3 Verified Local Backups

Supabase removed. Adds JSON export/import, local restore points, and automatic restore points after workouts. This build has been locally checked with `npm run build`.


## v12 UI Upgrade

Visual improvements:
- Redesigned premium dashboard
- Today's workout hero card
- Weekly volume and library metric cards
- Muscle recovery-style volume tiles
- Recent PR signal feed
- Cleaner mobile visual polish

Next planned features:
- Body heat map
- Exercise GIF/YouTube embeds
- Exercise demo cards


## v13 Update — Body Heat Map + Planned Calendar

Added:
- Weekly body heat map on the homepage.
- Front and back body views.
- Heat intensity based on weekly training volume.
- Planned workouts on the calendar.
- Planned workouts appear as muted/dotted blocks.
- Drag or tap routines onto calendar days to plan workouts.

Note:
- Planned workouts are calendar planning items. When you complete a workout normally, it appears as the solid coloured calendar block.


## v14 Professional Heat Map

Improved the heat map to be more professional and anatomically detailed.

Added muscle regions:
- Traps
- Erectors
- Upper back
- Lats
- Rear delts
- Side delts
- Front delts
- Abs
- Obliques
- Quads
- Hamstrings
- Adductors
- Abductors
- Calves
- Glutes
- Biceps
- Triceps
- Forearms


## v15 Update
- Monday-Sunday week calendar with previous/next controls.
- Planned dotted workout blocks and completed solid blocks.
- Start empty workout and add exercises during workout.
- Option to save custom workout as a routine.
- Hevy-style set logger with blue completed sets.
- Previous set weight/reps under each entry.
- Floating rest timer and active workout resume safeguards.


## v16 Heat Map Accuracy + Search
- Weighted primary/secondary muscle contribution.
- Volume/recovery heat map toggle.
- Recovery percentages by muscle.
- Searchable exercise selector to avoid scrolling.

## v17 Performance + Polish
- Workout History tab
- Detailed workout history view
- PR detection when saving sets
- Exercise notes in exercise detail
- Smarter floating rest timer with reset/+15
- Sleeker bottom navigation colours and glass effect
