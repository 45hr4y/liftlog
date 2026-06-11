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


## v18 Nutrition Integrated

Added Nutrition as a built-in LiftLog page/tab:
- Water tracking
- Creatine tracking
- Caffeine tracking
- Meal accountability log
- Protein and fruit/veg checkboxes
- Daily reflection
- 7-day consistency view
- Nutrition JSON export/import


## v19 Nutrition Pro
- Premium nutrition dashboard UI
- Protein serving target without calorie tracking
- Creatine streak
- Caffeine last logged time
- Meal quality summary
- Weekly consistency review

## v20 Nutrition iPhone Polish
- Nutrition score now starts at 0%.
- Removed automatic caffeine points.
- Added 0/5 daily habit checklist.
- Added iPhone quick action card.
- Larger mobile tap targets and cleaner meal logging.


## v21 Builder Upgrade

Added:
- Secondary muscles for exercises.
- Heat map and weekly muscle buckets now include selected secondary muscles.
- Create exercises while building routines.
- Create machines/subtypes from the routine builder.
- Add newly created exercises directly into routines.
- Search-first machine/exercise flow.
- More streamlined exercise, routine and machine UI.


## v22 Exercise Catalogue

Added:
- 105 starter exercises.
- Primary muscles and selected secondary muscles for each exercise.
- Starter Push / Pull / Legs routines if no routines exist yet.
- Catalogue search and filters for exercises.
- Existing custom exercises are preserved; the catalogue only fills missing names.

## v23 Streamlined Training + Analytics
- Removed workout as a separate bottom tab; training is accessed through Home/More to reduce clutter.
- Start routines directly from routine cards without a second confirmation selector.
- Added create-and-start-new-routine flow.
- Fixed weight placeholders so lb variants show lb.
- Variant-selected units are locked automatically.
- Added in-app RIR explanation.
- Combined workout and nutrition history.
- Added exercise progression graphs in Stats.


## v24 Favourite Exercises

Added:
- Favourite/star exercises from the Exercise Library.
- Exercise Progression Graphs can show favourites only.
- Favourite count appears in More.
- Cleaner stats dropdown when you have many catalogue exercises.

## v25-v27 Combined Upgrade
- Temporary exercise replacement during workout, without changing the routine.
- Suggested replacements based on primary/secondary muscles.
- Recovery readiness chips on Home.
- Weekly planner has quick move buttons for planned workouts.
- Workout and nutrition history cards are more detailed.

## v28 Workout Variants + Rest Days + iPhone Inputs

Added:
- Create machine variants during an active workout.
- Upload/attach machine images during workout.
- Newly created variants are saved permanently for future sessions.
- Newly created variants are immediately added to the current workout.
- Added Rest days to calendar/planner.
- Added numeric input hints for iPhone keypad behaviour.


## v29 Mobile Workout Flow

Added:
- Routine progress bar during workout.
- Completed sets / target sets progress.
- Exercise count progress.
- Sticky keyboard assist panel while editing weight/reps/RIR.
- Previous set context remains visible above the iPhone keypad.
- Quick weight suggestion chips based on previous set.
- Better mobile spacing while the keypad is open.

## v30 Recovery + Editable History
- Added recovery-specific legend.
- Recovery cards now show status, score, recent sets and last trained.
- Added recommended training suggestion based on routine readiness.
- Added delete controls for workouts, individual sets, nutrition days and meal entries.

## v31 Safety + Sharing Polish
- Added first-time onboarding card.
- Added local-data and backup reminder.
- Added empty state on Home for new users.
- Added edit controls for previous sets.
- Added edit controls for meal entries.
- Added backup recency reminder.
- Clarified workout-only vs routine-save behaviour.

## v32 Premium UX + Machine Tags
- Added quick machine tags for variants, including during workouts.
- Machine tags show inside the workout logger.
- Added finish workout report.
- Added haptic feedback hooks for set save, PR, and workout finish.
- Removed old heatmap legend.
- Added floating action button.
- Added completion animations.


## v33 Workout Animations + Set Save Safety

Added:
- Save button now guards against double taps.
- Saving an existing set updates that set instead of creating duplicates.
- Workout progress now counts unique completed sets.
- Exercise complete banner.
- Completed exercise collapse styling.
- Auto-focus/scroll toward the next exercise after completion.
- PR banner and set-complete animation polish.


## v34 Finish Flow Stability
- Fixed intermittent blank screen risk after finishing workouts.
- Finish report now guards against undefined/null summary fields.
- Completion banner no longer uses sticky positioning, preventing overlap with workout header.
- Safer exercise completion click/focus behaviour.


## v35 Header + Collapse Fix

Fixed:
- Completed exercise collapse no longer clashes with the floating workout header.
- Completion banner is now inline-only, not sticky.
- Added safe scroll margin under the workout header.
- Auto-scroll to next exercise now centers the next card instead of pushing it underneath the header.


## v36 Finish + FAB Fix

Fixed:
- Finishing a workout with unfinished planned sets no longer blanks the app.
- Finish summary now safely handles incomplete/missing workout data.
- Finish report shows how many planned sets were left incomplete.
- Floating + button is hidden during active workouts so it no longer clashes with the timer controls.

## v37 Blank Screen Guard
- Added app-wide error boundary to prevent white/blank screens.
- Blank screens now show a recoverable error card.
- Added buttons to retry, reset active workout view, or reload.
- Refresh now tolerates missing/older local database tables more safely.
- Exercise detail page now has a safe fallback if no exercise is selected.

## v38 Hardening Pass
- Added global runtime error listeners.
- Added recoverable runtime error card.
- Added emergency localStorage backup button for crash cases.
- Invalid active workout IDs are cleared safely.
- Active workouts ignore already-ended workouts.
- Hardened workout finish, logger, seed and page rendering paths.
- Fixed stale Progress page navigation to use Stats.


## v39 Streamlined Mobile Dashboard

Added:
- Home dashboard is now split into Overview / Recovery / Body Map / PRs tabs.
- Reduced the long-scroll feeling on iPhone.
- Recovery and body map sections are easier to view independently.
- Machine photos now support both taking a photo and uploading from camera roll.
- In-workout variant creation can use the current/focused exercise if no exercise is manually selected.
- Variant button wording clarified: saving a machine variant is for future use.


## v40 Save Feedback + Favourite Progression

Fixed:
- In-workout machine variant saving now gives visible confirmation.
- Machine variant creation now saves to the database even if the exercise is already in the workout.
- Added success tick/animation when a machine subtype is saved from the Machines page.
- Added Favourite Progression cards to the PR tab on Home.
- Favourite progression shows best estimated 1RM, change over time, and a mini trend line.


## v41 Machine Photo UX Polish

Changed:
- Removed separate "Take photo" button.
- Machine photo uses one native iPhone picker: Add / Change Machine Photo.
- The native iPhone picker can still choose Photo Library, Camera, or Files when available.
- Added remove-photo button before saving.
- Saving a variant now auto-selects/focuses the relevant exercise where possible.
- Button copy simplified to "Save machine variant".


## v47 First-Day UX Polish
- Machine images are larger and expandable.
- Added expandable machine photos inside workout exercise cards.
- Removed redundant machine settings UI from the machine builder.
- Machine tags remain as the simpler machine-setting memory system.
- New machines are now added directly under the exercise card while training.
- Top workout add panel now focuses on adding exercises only.
- Exercise add flow now clears search and shows a smoother success confirmation.
- Nutrition defaults are less assumptive: meal type defaults to Other and protein is not pre-checked.
- Snacks no longer count as meals in summary counters.
- Removed the Next Upgrade Preview card.
