
import { useEffect, useMemo, useState } from 'react';
import Dexie, { Table } from 'dexie';
import {Activity, BarChart3, CalendarDays, Check, Dumbbell, Home, ImagePlus, ListChecks, Moon, Play, Plus, Settings, Sun, Trash2, Apple, Star} from 'lucide-react';

type Unit = 'kg' | 'lb';
type Theme = 'light' | 'dark';
type Page = 'home' | 'exercises' | 'exerciseDetail' | 'subtypes' | 'routines' | 'log' | 'calendar' | 'history' | 'nutrition' | 'progress' | 'stats' | 'backup' | 'settings' | 'more';
type SettingType = 'dropdown' | 'checkbox' | 'text';

type AppSettings = { id: 'settings'; unit: Unit; theme: Theme };
type BackupSnapshot = { id?: number; name: string; reason: string; createdAt: string; payload: any };
type Exercise = { id?: number; name: string; muscle: string; secondaryMuscles?: string[]; equipment: string; notes?: string; favourite?: boolean; createdAt: string };
type MachineSetting = { id: string; label: string; type: SettingType; options?: string[]; defaultValue?: string | boolean };
type Subtype = { id?: number; exerciseId: number; name: string; defaultUnit: Unit; photo?: Blob; settings: MachineSetting[]; createdAt: string };
type Routine = { id?: number; name: string; color: string; archived?: boolean; createdAt: string };
type RoutineExercise = { id?: number; routineId: number; exerciseId: number; subtypeId?: number; order: number; sets: number; reps: string; rest: number; createdAt: string };
type Workout = { id?: number; routineId?: number; title: string; date: string; startedAt: string; endedAt?: string };
type PlannedWorkout = { id?: number; routineId?: number; type?: 'workout' | 'rest'; date: string; note?: string; createdAt: string };
type WorkoutSet = { id?: number; workoutId: number; exerciseId: number; subtypeId?: number; setNumber: number; weight: number; reps: number; unit: Unit; rir?: number; completed: boolean; settingValues?: Record<string, string | boolean>; createdAt: string };
type WorkoutReplacement = { id?: number; workoutId: number; routineExerciseId: number; originalExerciseId: number; replacementExerciseId: number; reason?: string; createdAt: string };

class LiftDB extends Dexie {
  settings!: Table<AppSettings, string>;
  exercises!: Table<Exercise, number>;
  subtypes!: Table<Subtype, number>;
  routines!: Table<Routine, number>;
  routineExercises!: Table<RoutineExercise, number>;
  workouts!: Table<Workout, number>;
  sets!: Table<WorkoutSet, number>;
  plannedWorkouts!: Table<PlannedWorkout, number>;
  replacements!: Table<WorkoutReplacement, number>;
  backups!: Table<BackupSnapshot, number>;
  constructor() {
    super('liftlog_v12_ui_upgrade_db');
    this.version(1).stores({
      settings: 'id',
      exercises: '++id,name,muscle,equipment',
      subtypes: '++id,exerciseId,name,defaultUnit',
      routines: '++id,name,color',
      routineExercises: '++id,routineId,exerciseId,subtypeId,order',
      workouts: '++id,routineId,date',
      sets: '++id,workoutId,exerciseId,subtypeId,createdAt',
      plannedWorkouts: '++id,routineId,date',
      replacements: '++id,workoutId,routineExerciseId,originalExerciseId,replacementExerciseId',
      backups: '++id,createdAt,reason'
    });
  }
}
const db = new LiftDB();

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0,10);
const blobUrl = (b?: Blob) => b ? URL.createObjectURL(b) : undefined;
const kgValue = (s: WorkoutSet) => (s.unit === 'kg' ? s.weight : s.weight / 2.2046226218);
const volumeKg = (s: WorkoutSet) => kgValue(s) * s.reps;
const fmtVol = (n: number) => `${Math.round(n).toLocaleString()} kg`;
const muscleBuckets: Record<string, string[]> = {
  Core: ['Abs','Obliques'],
  Chest: ['Chest'],
  Shoulders: ['Front Delt','Rear Delt','Side Delt'],
  Biceps: ['Biceps'],
  Triceps: ['Triceps'],
  Legs: ['Hamstrings','Quadriceps','Calves','Glutes'],
  Back: ['Upper Back','Erectors','Lats']
};

function bucketForMuscle(muscle: string) {
  const found = Object.entries(muscleBuckets).find(([, muscles]) => muscles.includes(muscle));
  return found ? found[0] : 'Other';
}

function weeklyWorkoutSets(workouts: Workout[], sets: WorkoutSet[]) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const week = weekStart.toISOString().slice(0,10);
  const weekWorkouts = workouts.filter(w => w.date >= week);
  return sets.filter(s => weekWorkouts.some(w => w.id === s.workoutId));
}

function weeklyVolumeByBucket(exercises: Exercise[], workouts: Workout[], sets: WorkoutSet[]) {
  const result: Record<string, number> = { Core: 0, Chest: 0, Shoulders: 0, Biceps: 0, Triceps: 0, Legs: 0, Back: 0 };
  weeklyWorkoutSets(workouts, sets).forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    const bucket = bucketForMuscle(ex.muscle);
    if (bucket in result) result[bucket] += volumeKg(s);
  });
  return result;
}

function workoutSummary(workout: Workout | undefined, exercises: Exercise[], sets: WorkoutSet[]) {
  if (!workout) return null;
  const workoutSets = sets.filter(s => s.workoutId === workout.id);
  const totalVolume = workoutSets.reduce((a, s) => a + volumeKg(s), 0);
  const muscleVolumes: Record<string, number> = {};
  workoutSets.forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    const bucket = bucketForMuscle(ex.muscle);
    muscleVolumes[bucket] = (muscleVolumes[bucket] || 0) + volumeKg(s);
  });
  const topMuscle = Object.entries(muscleVolumes).sort((a: [string, number], b: [string, number])=>b[1]-a[1])[0];
  const uniqueExercises = new Set(workoutSets.map(s => s.exerciseId)).size;
  const bestSet = [...workoutSets].sort((a: WorkoutSet, b: WorkoutSet)=>volumeKg(b)-volumeKg(a))[0];
  const bestE1RMSet = [...workoutSets].sort((a: WorkoutSet, b: WorkoutSet)=>e1rm(kgValue(b), b.reps)-e1rm(kgValue(a), a.reps))[0];
  return {
    totalSets: workoutSets.length,
    totalVolume,
    uniqueExercises,
    topMuscle,
    bestSet,
    bestE1RMSet,
    workoutSets
  };
}

function workoutDurationMinutes(workout: Workout | undefined) {
  if (!workout?.startedAt) return 0;
  const start = new Date(workout.startedAt).getTime();
  const end = workout.endedAt ? new Date(workout.endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 60000));
}



const convert = (v: number, from: Unit, to: Unit) => from === to ? v : from === 'kg' ? v * 2.2046226218 : v / 2.2046226218;
const e1rm = (w: number, r: number) => Math.round(w * (1 + r/30) * 10) / 10;

const muscles = ['Traps','Erectors','Upper Back','Lats','Rear Delt','Side Delt','Front Delt','Abs','Obliques','Quadriceps','Hamstrings','Adductors','Abductors','Calves','Glutes','Biceps','Triceps','Forearms','Chest','Other'];
const equipment = ['Machine','Cable','Dumbbell','Barbell','Smith Machine','Bodyweight','Other'];
const colours = ['#7c3aed','#2563eb','#16a34a','#dc2626','#ea580c','#0891b2','#db2777','#4b5563'];

const starterExercises: Omit<Exercise, 'id' | 'createdAt'>[] = [
  {
    "name": "Dumbbell Lateral Raise",
    "muscle": "Side Delt",
    "secondaryMuscles": [
      "Traps"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Cable Lateral Raise",
    "muscle": "Side Delt",
    "secondaryMuscles": [
      "Traps"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Machine Lateral Raise",
    "muscle": "Side Delt",
    "secondaryMuscles": [
      "Traps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Seated Dumbbell Shoulder Press",
    "muscle": "Front Delt",
    "secondaryMuscles": [
      "Side Delt",
      "Triceps"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Smith Machine Shoulder Press",
    "muscle": "Front Delt",
    "secondaryMuscles": [
      "Side Delt",
      "Triceps"
    ],
    "equipment": "Smith Machine"
  },
  {
    "name": "Arnold Press",
    "muscle": "Front Delt",
    "secondaryMuscles": [
      "Side Delt",
      "Triceps"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Rear Delt Fly",
    "muscle": "Rear Delt",
    "secondaryMuscles": [
      "Upper Back"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Reverse Pec Deck",
    "muscle": "Rear Delt",
    "secondaryMuscles": [
      "Upper Back"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Face Pull",
    "muscle": "Rear Delt",
    "secondaryMuscles": [
      "Traps",
      "Upper Back"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Cable Y Raise",
    "muscle": "Side Delt",
    "secondaryMuscles": [
      "Rear Delt",
      "Traps"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Upright Row",
    "muscle": "Side Delt",
    "secondaryMuscles": [
      "Traps",
      "Biceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Barbell Bench Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt",
      "Triceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Incline Barbell Bench Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt",
      "Triceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Decline Bench Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Triceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Dumbbell Bench Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt",
      "Triceps"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Incline Dumbbell Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt",
      "Triceps"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Machine Chest Press",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt",
      "Triceps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Pec Deck",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Cable Fly",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Low to High Cable Fly",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Chest Dip",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Triceps",
      "Front Delt"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Push Up",
    "muscle": "Chest",
    "secondaryMuscles": [
      "Triceps",
      "Front Delt",
      "Abs"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Pull Up",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Biceps",
      "Forearms",
      "Upper Back"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Chin Up",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Biceps",
      "Forearms"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Lat Pulldown",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Biceps",
      "Forearms"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Neutral Grip Pulldown",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Biceps",
      "Upper Back"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Single Arm Lat Pulldown",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Biceps",
      "Obliques"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Seated Cable Row",
    "muscle": "Upper Back",
    "secondaryMuscles": [
      "Lats",
      "Biceps",
      "Rear Delt"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Chest Supported Row",
    "muscle": "Upper Back",
    "secondaryMuscles": [
      "Lats",
      "Rear Delt",
      "Biceps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "T-Bar Row",
    "muscle": "Upper Back",
    "secondaryMuscles": [
      "Lats",
      "Rear Delt",
      "Biceps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Single Arm Dumbbell Row",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Upper Back",
      "Biceps",
      "Forearms"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Machine Row",
    "muscle": "Upper Back",
    "secondaryMuscles": [
      "Lats",
      "Biceps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "High Row Machine",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Upper Back",
      "Biceps"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Straight Arm Pulldown",
    "muscle": "Lats",
    "secondaryMuscles": [
      "Triceps",
      "Abs"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Barbell Row",
    "muscle": "Upper Back",
    "secondaryMuscles": [
      "Lats",
      "Rear Delt",
      "Biceps",
      "Erectors"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Barbell Shrug",
    "muscle": "Traps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Dumbbell Shrug",
    "muscle": "Traps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Smith Machine Shrug",
    "muscle": "Traps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Smith Machine"
  },
  {
    "name": "Farmer Carry",
    "muscle": "Traps",
    "secondaryMuscles": [
      "Forearms",
      "Abs",
      "Obliques"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Conventional Deadlift",
    "muscle": "Erectors",
    "secondaryMuscles": [
      "Glutes",
      "Hamstrings",
      "Traps",
      "Forearms"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Romanian Deadlift",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Glutes",
      "Erectors",
      "Forearms"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Dumbbell Romanian Deadlift",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Glutes",
      "Erectors"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Rack Pull",
    "muscle": "Erectors",
    "secondaryMuscles": [
      "Traps",
      "Glutes",
      "Forearms"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Back Extension",
    "muscle": "Erectors",
    "secondaryMuscles": [
      "Glutes",
      "Hamstrings"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Good Morning",
    "muscle": "Erectors",
    "secondaryMuscles": [
      "Hamstrings",
      "Glutes"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Barbell Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "EZ Bar Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "EZ Bar"
  },
  {
    "name": "Cable Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Incline Dumbbell Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Preacher Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Hammer Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Bayesian Cable Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Concentration Curl",
    "muscle": "Biceps",
    "secondaryMuscles": [
      "Forearms"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Rope Triceps Pushdown",
    "muscle": "Triceps",
    "secondaryMuscles": [],
    "equipment": "Cable"
  },
  {
    "name": "Straight Bar Triceps Pushdown",
    "muscle": "Triceps",
    "secondaryMuscles": [],
    "equipment": "Cable"
  },
  {
    "name": "Skull Crusher",
    "muscle": "Triceps",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "EZ Bar"
  },
  {
    "name": "Overhead Triceps Extension",
    "muscle": "Triceps",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Machine Dip",
    "muscle": "Triceps",
    "secondaryMuscles": [
      "Chest"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Close Grip Bench Press",
    "muscle": "Triceps",
    "secondaryMuscles": [
      "Chest",
      "Front Delt"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Dumbbell Overhead Extension",
    "muscle": "Triceps",
    "secondaryMuscles": [
      "Front Delt"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Wrist Curl",
    "muscle": "Forearms",
    "secondaryMuscles": [],
    "equipment": "Dumbbell"
  },
  {
    "name": "Reverse Curl",
    "muscle": "Forearms",
    "secondaryMuscles": [
      "Biceps"
    ],
    "equipment": "EZ Bar"
  },
  {
    "name": "Reverse Wrist Curl",
    "muscle": "Forearms",
    "secondaryMuscles": [],
    "equipment": "Dumbbell"
  },
  {
    "name": "Crunch",
    "muscle": "Abs",
    "secondaryMuscles": [],
    "equipment": "Bodyweight"
  },
  {
    "name": "Machine Crunch",
    "muscle": "Abs",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Cable Crunch",
    "muscle": "Abs",
    "secondaryMuscles": [],
    "equipment": "Cable"
  },
  {
    "name": "Hanging Leg Raise",
    "muscle": "Abs",
    "secondaryMuscles": [
      "Obliques"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Reverse Crunch",
    "muscle": "Abs",
    "secondaryMuscles": [],
    "equipment": "Bodyweight"
  },
  {
    "name": "Ab Wheel Rollout",
    "muscle": "Abs",
    "secondaryMuscles": [
      "Obliques",
      "Erectors"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Plank",
    "muscle": "Abs",
    "secondaryMuscles": [
      "Obliques",
      "Erectors"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Russian Twist",
    "muscle": "Obliques",
    "secondaryMuscles": [
      "Abs"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Cable Woodchop",
    "muscle": "Obliques",
    "secondaryMuscles": [
      "Abs"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Side Plank",
    "muscle": "Obliques",
    "secondaryMuscles": [
      "Abs"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Pallof Press",
    "muscle": "Obliques",
    "secondaryMuscles": [
      "Abs"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Back Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Erectors",
      "Abs"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Front Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Abs",
      "Erectors"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Hack Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Pendulum Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Leg Press",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Adductors"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Leg Extension",
    "muscle": "Quadriceps",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Bulgarian Split Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Adductors"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Walking Lunge",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Hamstrings"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Smith Machine Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Smith Machine"
  },
  {
    "name": "Goblet Squat",
    "muscle": "Quadriceps",
    "secondaryMuscles": [
      "Glutes",
      "Abs"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "Seated Leg Curl",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Calves"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Lying Leg Curl",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Calves"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Standing Leg Curl",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Calves"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Nordic Curl",
    "muscle": "Hamstrings",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Hip Thrust",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Hamstrings",
      "Quadriceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Machine Hip Thrust",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Hamstrings"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Glute Bridge",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Hamstrings"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Cable Kickback",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Hamstrings"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Step Up",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Quadriceps",
      "Hamstrings"
    ],
    "equipment": "Dumbbell"
  },
  {
    "name": "45 Degree Glute Extension",
    "muscle": "Glutes",
    "secondaryMuscles": [
      "Hamstrings",
      "Erectors"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Adductor Machine",
    "muscle": "Adductors",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Copenhagen Plank",
    "muscle": "Adductors",
    "secondaryMuscles": [
      "Abs",
      "Obliques"
    ],
    "equipment": "Bodyweight"
  },
  {
    "name": "Wide Stance Squat",
    "muscle": "Adductors",
    "secondaryMuscles": [
      "Glutes",
      "Quadriceps"
    ],
    "equipment": "Barbell"
  },
  {
    "name": "Abductor Machine",
    "muscle": "Abductors",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Machine"
  },
  {
    "name": "Cable Hip Abduction",
    "muscle": "Abductors",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Cable"
  },
  {
    "name": "Lateral Band Walk",
    "muscle": "Abductors",
    "secondaryMuscles": [
      "Glutes"
    ],
    "equipment": "Band"
  },
  {
    "name": "Standing Calf Raise",
    "muscle": "Calves",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Seated Calf Raise",
    "muscle": "Calves",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Leg Press Calf Raise",
    "muscle": "Calves",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Donkey Calf Raise",
    "muscle": "Calves",
    "secondaryMuscles": [],
    "equipment": "Machine"
  },
  {
    "name": "Single Leg Calf Raise",
    "muscle": "Calves",
    "secondaryMuscles": [],
    "equipment": "Bodyweight"
  }
];

async function seed(){
  const s=await db.settings.get('settings');
  if(!s) await db.settings.put({id:'settings',unit:'kg',theme:'light'});

  const existing = await db.exercises.toArray();
  const byName = new Set(existing.map(e=>e.name.toLowerCase().trim()));
  let added = 0;

  for (const item of starterExercises) {
    const key = item.name.toLowerCase().trim();
    if (!byName.has(key)) {
      await db.exercises.add({...item, createdAt:now()});
      byName.add(key);
      added++;
    }
  }

  // Starter routine only if there are no routines yet.
  const routineCount = await db.routines.count();
  if(routineCount===0){
    const pushId = await db.routines.add({name:'Push Starter', color:'#2563eb', archived:false, createdAt:now()});
    const pullId = await db.routines.add({name:'Pull Starter', color:'#10b981', archived:false, createdAt:now()});
    const legsId = await db.routines.add({name:'Legs Starter', color:'#f97316', archived:false, createdAt:now()});
    const all = await db.exercises.toArray();
    async function addToRoutine(routineId:number, names:string[]){
      let order=1;
      for(const name of names){
        const ex = all.find(e=>e.name===name);
        if(ex?.id) await db.routineExercises.add({routineId,exerciseId:ex.id,order:order++,sets:3,reps:'8-12',rest:90,createdAt:now()});
      }
    }
    await addToRoutine(pushId,['Barbell Bench Press','Incline Dumbbell Press','Machine Lateral Raise','Rope Triceps Pushdown']);
    await addToRoutine(pullId,['Lat Pulldown','Seated Cable Row','Reverse Pec Deck','EZ Bar Curl']);
    await addToRoutine(legsId,['Hack Squat','Romanian Deadlift','Leg Extension','Seated Leg Curl','Standing Calf Raise']);
  }
}

function allTimePRsForExercise(exerciseId: number | undefined, sets: WorkoutSet[]) {
  if (!exerciseId) return null;
  const exerciseSets = sets.filter(s => s.exerciseId === exerciseId);
  if (!exerciseSets.length) return null;
  const heaviest = [...exerciseSets].sort((a: WorkoutSet, b: WorkoutSet)=>kgValue(b)-kgValue(a))[0];
  const bestVolumeSet = [...exerciseSets].sort((a: WorkoutSet, b: WorkoutSet)=>volumeKg(b)-volumeKg(a))[0];
  const bestE1RM = [...exerciseSets].sort((a: WorkoutSet, b: WorkoutSet)=>e1rm(kgValue(b),b.reps)-e1rm(kgValue(a),a.reps))[0];
  const mostReps = [...exerciseSets].sort((a: WorkoutSet, b: WorkoutSet)=>b.reps-a.reps)[0];
  const totalVolume = exerciseSets.reduce((a,s)=>a+volumeKg(s),0);
  return { heaviest, bestVolumeSet, bestE1RM, mostReps, totalVolume, setCount: exerciseSets.length };
}

function lastSessionsForExercise(exerciseId: number | undefined, workouts: Workout[], sets: WorkoutSet[], limit = 5) {
  if (!exerciseId) return [];
  const byWorkout = workouts
    .map(w => ({ workout: w, sets: sets.filter(s => s.workoutId === w.id && s.exerciseId === exerciseId) }))
    .filter(row => row.sets.length)
    .sort((a: any, b: any)=>b.workout.date.localeCompare(a.workout.date))
    .slice(0, limit);
  return byWorkout;
}

function previousSetForNumber(exerciseId:number, subtypeId:number|undefined, setNumber:number, workout:Workout, workouts:Workout[], sets:WorkoutSet[]) {
  const prev = previousSets(exerciseId, subtypeId, workout, workouts, sets);
  return prev.find(s => s.setNumber === setNumber);
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [settings, setSettings] = useState<AppSettings>({id:'settings',unit:'kg',theme:'light'});
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [subtypes, setSubtypes] = useState<Subtype[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineExercises, setRoutineExercises] = useState<RoutineExercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [replacements, setReplacements] = useState<WorkoutReplacement[]>([]);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState<number|undefined>();
  function setActiveWorkoutId(id:number|undefined){ setActiveWorkoutIdState(id); if(id) localStorage.setItem('liftlog-active-workout-id', String(id)); else localStorage.removeItem('liftlog-active-workout-id'); }
  const [selectedExerciseId, setSelectedExerciseId] = useState<number|undefined>();

  async function refresh() {
    setSettings(await db.settings.get('settings') || {id:'settings',unit:'kg',theme:'light'});
    setExercises(await db.exercises.orderBy('name').toArray());
    setSubtypes(await db.subtypes.toArray());
    setRoutines(await db.routines.orderBy('name').toArray());
    setRoutineExercises(await db.routineExercises.toArray());
    setWorkouts(await db.workouts.orderBy('date').reverse().toArray());
    setSets(await db.sets.toArray());
    setPlannedWorkouts(await db.plannedWorkouts.toArray());
    setReplacements(await db.replacements.toArray());
  }
  useEffect(()=>{ seed().then(async()=>{ await refresh(); const saved=localStorage.getItem('liftlog-active-workout-id'); if(saved){ const w=await db.workouts.get(Number(saved)); if(w && !w.endedAt) setActiveWorkoutId(Number(saved)); } }); },[]);
  useEffect(()=>{ document.body.dataset.theme = settings.theme; },[settings.theme]);
  const activeWorkout = workouts.find(w=>w.id===activeWorkoutId);

  return <div className="shell">
    <header className="topbar">
      <div><div className="eyebrow">LiftLog</div><h1>{title(page)}</h1></div>
      <button className="iconBtn" onClick={async()=>{await db.settings.put({...settings,theme:settings.theme==='light'?'dark':'light'}); refresh();}}>{settings.theme==='light'?<Moon/>:<Sun/>}</button>
    </header>
    <main>
      {page==='home' && <HomePage data={{exercises,subtypes,routines,workouts,sets,plannedWorkouts,setPage}} />}
      {page==='exercises' && <ExercisesPage data={{exercises,subtypes,sets,workouts,routines,routineExercises,refresh,setPage,setSelectedExerciseId}} />}
      {page==='exerciseDetail' && <ExerciseDetailPage data={{selectedExerciseId,exercises,subtypes,workouts,sets,setPage}} />}
      {page==='subtypes' && <SubtypesPage data={{exercises,subtypes,refresh}} />}
      {page==='routines' && <RoutinesPage data={{exercises,subtypes,routines,routineExercises,refresh}} />}
      {page==='log' && <LogPage data={{settings,exercises,subtypes,routines,routineExercises,workouts,sets,replacements,activeWorkout,setActiveWorkoutId,refresh}} />}
      {page==='calendar' && <CalendarPage data={{routines,workouts,sets,plannedWorkouts,refresh,setPage}} />}
      {page==='history' && <HistoryPage data={{exercises,subtypes,routines,workouts,sets,replacements}} />}
      {page==='nutrition' && <NutritionPage />}
      {page==='more' && <MorePage data={{setPage,exercises,subtypes,routines}} />}
      {page==='stats' && <StatsPage data={{settings,exercises,workouts,sets}} />}
      {page==='backup' && <BackupPage data={{refresh}} />}
      {page==='settings' && <SettingsPage data={{settings,refresh}} />}
    </main>
    <nav className="tabs fiveTabs premiumTabs">
      <Tab p="home" page={page} setPage={setPage} icon={<Home/>} label="Home"/>
      <Tab p="calendar" page={page} setPage={setPage} icon={<CalendarDays/>} label="Calendar"/>
      <Tab p="history" page={page} setPage={setPage} icon={<ListChecks/>} label="History"/>
      <Tab p="nutrition" page={page} setPage={setPage} icon={<Apple/>} label="Nutrition"/>
      <Tab p="more" page={page} setPage={setPage} icon={<Settings/>} label="More"/>
    </nav>
  </div>
}
function title(p:Page){return {home:'Dashboard',exercises:'Exercises',subtypes:'Subtypes',routines:'Routines',log:'Workout',calendar:'Calendar',history:'History',nutrition:'Nutrition',stats:'Stats',settings:'Settings',exerciseDetail:'Exercise Detail',progress:'Progress',backup:'Backup',more:'More'}[p]}
function Tab({p,page,setPage,icon,label}:any){return <button className={page===p?'tab active':'tab'} onClick={()=>setPage(p)}>{icon}<span>{label}</span></button>}
function Card({children, cls=''}:any){return <div className={'card '+cls}>{children}</div>}
function Pills({children}:any){return <div className="pills">{children}</div>}


function workoutsThisWeek(workouts: Workout[]) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const week = weekStart.toISOString().slice(0,10);
  return workouts.filter(w => w.date >= week);
}

function groupVolumesForWeek(exercises: Exercise[], workouts: Workout[], sets: WorkoutSet[]) {
  const groups: Record<string, number> = { Chest:0, Back:0, Shoulders:0, Legs:0, Arms:0, Core:0 };
  const weekWorkouts = workoutsThisWeek(workouts);
  const weekSets = sets.filter(s => weekWorkouts.some(w => w.id === s.workoutId));
  weekSets.forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    const m = ex.muscle;
    const bucket =
      ['Chest'].includes(m) ? 'Chest' :
      ['Upper Back','Erectors','Lats','Traps'].includes(m) ? 'Back' :
      ['Front Delt','Rear Delt','Side Delt','Shoulders'].includes(m) ? 'Shoulders' :
      ['Hamstrings','Quadriceps','Calves','Glutes','Adductors','Abductors'].includes(m) ? 'Legs' :
      ['Biceps','Triceps','Forearms'].includes(m) ? 'Arms' :
      ['Abs','Obliques','Core'].includes(m) ? 'Core' : 'Core';
    groups[bucket] += volumeKg(s);
  });
  return groups;
}

function recentPRItems(exercises: Exercise[], sets: WorkoutSet[]) {
  const bestByExercise = new Map<number, WorkoutSet>();
  sets.forEach(s => {
    const current = bestByExercise.get(s.exerciseId);
    if (!current || e1rm(kgValue(s), s.reps) > e1rm(kgValue(current), current.reps)) {
      bestByExercise.set(s.exerciseId, s);
    }
  });
  return [...bestByExercise.values()]
    .sort((a: WorkoutSet, b: WorkoutSet) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map(s => ({ set: s, exercise: exercises.find(e => e.id === s.exerciseId) }));
}

function recoveryLabel(volume: number) {
  if (volume <= 0) return { label: 'Fresh', cls: 'fresh' };
  if (volume < 2500) return { label: 'Light', cls: 'light' };
  if (volume < 7000) return { label: 'Trained', cls: 'trained' };
  return { label: 'High', cls: 'high' };
}

function heatIntensityClass(value: number, max: number) {
  if (!value) return 'heat0';
  const ratio = value / Math.max(max, 1);
  if (ratio < .25) return 'heat1';
  if (ratio < .55) return 'heat2';
  if (ratio < .85) return 'heat3';
  return 'heat4';
}

function muscleHeatValues(exercises: Exercise[], workouts: Workout[], sets: WorkoutSet[]) {
  const values: Record<string, number> = {
    Chest:0, Traps:0, Erectors:0, UpperBack:0, Lats:0,
    RearDelt:0, SideDelt:0, FrontDelt:0,
    Abs:0, Obliques:0,
    Quads:0, Hamstrings:0, Adductors:0, Abductors:0, Calves:0, Glutes:0,
    Biceps:0, Triceps:0, Forearms:0
  };
  const weekWorkouts = workoutsThisWeek(workouts);
  const weekSets = sets.filter(s => weekWorkouts.some(w => w.id === s.workoutId));
  weekSets.forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    addWeightedMuscle(values, ex.muscle, volumeKg(s), ex.secondaryMuscles || []);
  });
  return values;
}

function BodyHeatMap({values, exercises=[], workouts=[], sets=[]}:{values:Record<string, number>; exercises?:Exercise[]; workouts?:Workout[]; sets?:WorkoutSet[]}) {
  const [mode,setMode]=useState<'volume'|'recovery'>('volume');
  const recovery = recoveryValuesFromVolume(values, exercises, workouts, sets);
  const display = mode==='volume' ? values : recovery;
  const max = mode==='volume' ? Math.max(...Object.values(values), 1) : 100;
  const cls = (key:string) => `hmPart ${mode==='volume' ? heatIntensityClass(display[key] || 0, max) : recoveryClass(display[key] || 0)}`;
  const label = (key:string, name:string) => <div className="hmLabel"><span className={mode==='volume' ? heatIntensityClass(display[key] || 0, max) : recoveryClass(display[key] || 0)}></span>{name}<em>{mode==='volume'?fmtVol(display[key]||0):`${Math.round(display[key]||0)}%`}</em></div>;

  return <div className="proHeatMap"><div className="heatToggle"><button className={mode==='volume'?'active':''} onClick={()=>setMode('volume')}>Volume</button><button className={mode==='recovery'?'active':''} onClick={()=>setMode('recovery')}>Recovery</button></div>
    <div className="hmBodies">
      <svg className="hmSvg" viewBox="0 0 280 520" role="img" aria-label="Front body muscle heat map">
        <text x="140" y="24" textAnchor="middle" className="hmTitle">FRONT</text>
        <ellipse cx="140" cy="62" rx="34" ry="42" className="hmBase"/>
        <path d="M118 98 C118 122, 105 126, 95 146 L185 146 C175 126,162 122,162 98 Z" className="hmBase"/>
        <path d="M90 150 C70 170,55 210,48 260" className="hmLimb"/>
        <path d="M190 150 C210 170,225 210,232 260" className="hmLimb"/>
        <path d="M102 390 C95 435,93 470,90 505" className="hmLimb"/>
        <path d="M178 390 C185 435,187 470,190 505" className="hmLimb"/>
        <path className={cls('Chest')} d="M100 150 C112 138,132 141,136 154 L136 204 C119 204,105 194,98 176 Z"/>
        <path className={cls('Chest')} d="M180 150 C168 138,148 141,144 154 L144 204 C161 204,175 194,182 176 Z"/>
        <path className={cls('FrontDelt')} d="M82 151 C61 160,54 178,54 198 C74 196,88 181,98 159 Z"/>
        <path className={cls('FrontDelt')} d="M198 151 C219 160,226 178,226 198 C206 196,192 181,182 159 Z"/>
        <path className={cls('SideDelt')} d="M55 197 C44 219,39 242,42 264 C59 260,70 231,72 203 Z"/>
        <path className={cls('SideDelt')} d="M225 197 C236 219,241 242,238 264 C221 260,210 231,208 203 Z"/>
        <path className={cls('Biceps')} d="M42 264 C42 292,51 319,65 335 C78 312,77 281,70 258 Z"/>
        <path className={cls('Biceps')} d="M238 264 C238 292,229 319,215 335 C202 312,203 281,210 258 Z"/>
        <path className={cls('Forearms')} d="M64 335 C57 360,55 379,65 396 C81 382,88 361,80 337 Z"/>
        <path className={cls('Forearms')} d="M216 335 C223 360,225 379,215 396 C199 382,192 361,200 337 Z"/>
        <path className={cls('Abs')} d="M113 210 C122 203,134 203,138 214 L138 316 C122 314,111 296,108 262 Z"/>
        <path className={cls('Abs')} d="M167 210 C158 203,146 203,142 214 L142 316 C158 314,169 296,172 262 Z"/>
        <path className={cls('Obliques')} d="M100 210 C92 242,91 282,109 316 C113 275,113 240,110 213 Z"/>
        <path className={cls('Obliques')} d="M180 210 C188 242,189 282,171 316 C167 275,167 240,170 213 Z"/>
        <path className={cls('Abductors')} d="M94 318 C82 347,85 382,105 402 C116 376,120 347,116 321 Z"/>
        <path className={cls('Abductors')} d="M186 318 C198 347,195 382,175 402 C164 376,160 347,164 321 Z"/>
        <path className={cls('Adductors')} d="M119 320 C116 352,121 382,135 405 C142 374,142 344,137 321 Z"/>
        <path className={cls('Adductors')} d="M161 320 C164 352,159 382,145 405 C138 374,138 344,143 321 Z"/>
        <path className={cls('Quads')} d="M95 402 C97 443,108 473,124 489 C140 455,136 424,126 402 Z"/>
        <path className={cls('Quads')} d="M185 402 C183 443,172 473,156 489 C140 455,144 424,154 402 Z"/>
        <path className={cls('Calves')} d="M99 490 C99 512,107 520,121 512 C128 495,129 474,122 454 C108 462,101 475,99 490 Z"/>
        <path className={cls('Calves')} d="M181 490 C181 512,173 520,159 512 C152 495,151 474,158 454 C172 462,179 475,181 490 Z"/>
      </svg>

      <svg className="hmSvg" viewBox="0 0 280 520" role="img" aria-label="Back body muscle heat map">
        <text x="140" y="24" textAnchor="middle" className="hmTitle">BACK</text>
        <ellipse cx="140" cy="62" rx="34" ry="42" className="hmBase"/>
        <path d="M118 98 C118 122, 105 126, 95 146 L185 146 C175 126,162 122,162 98 Z" className="hmBase"/>
        <path d="M90 150 C70 170,55 210,48 260" className="hmLimb"/>
        <path d="M190 150 C210 170,225 210,232 260" className="hmLimb"/>
        <path d="M102 390 C95 435,93 470,90 505" className="hmLimb"/>
        <path d="M178 390 C185 435,187 470,190 505" className="hmLimb"/>
        <path className={cls('Traps')} d="M106 136 C118 111,132 110,138 140 L138 238 C119 213,105 177,96 148 Z"/>
        <path className={cls('Traps')} d="M174 136 C162 111,148 110,142 140 L142 238 C161 213,175 177,184 148 Z"/>
        <path className={cls('UpperBack')} d="M98 150 C118 157,130 176,138 224 C117 218,101 195,92 166 Z"/>
        <path className={cls('UpperBack')} d="M182 150 C162 157,150 176,142 224 C163 218,179 195,188 166 Z"/>
        <path className={cls('RearDelt')} d="M82 151 C61 160,54 178,54 198 C74 196,88 181,98 159 Z"/>
        <path className={cls('RearDelt')} d="M198 151 C219 160,226 178,226 198 C206 196,192 181,182 159 Z"/>
        <path className={cls('Triceps')} d="M55 198 C42 230,43 287,66 334 C79 300,75 244,70 205 Z"/>
        <path className={cls('Triceps')} d="M225 198 C238 230,237 287,214 334 C201 300,205 244,210 205 Z"/>
        <path className={cls('Forearms')} d="M64 335 C57 360,55 379,65 396 C81 382,88 361,80 337 Z"/>
        <path className={cls('Forearms')} d="M216 335 C223 360,225 379,215 396 C199 382,192 361,200 337 Z"/>
        <path className={cls('Lats')} d="M96 198 C109 226,113 260,108 303 C92 283,83 239,88 202 Z"/>
        <path className={cls('Lats')} d="M184 198 C171 226,167 260,172 303 C188 283,197 239,192 202 Z"/>
        <path className={cls('Erectors')} d="M124 222 C134 225,138 245,138 318 C126 309,121 278,120 237 Z"/>
        <path className={cls('Erectors')} d="M156 222 C146 225,142 245,142 318 C154 309,159 278,160 237 Z"/>
        <path className={cls('Glutes')} d="M96 318 C116 309,134 319,139 341 C135 374,116 388,96 373 Z"/>
        <path className={cls('Glutes')} d="M184 318 C164 309,146 319,141 341 C145 374,164 388,184 373 Z"/>
        <path className={cls('Hamstrings')} d="M96 392 C96 436,107 472,126 489 C139 448,134 415,123 391 Z"/>
        <path className={cls('Hamstrings')} d="M184 392 C184 436,173 472,154 489 C141 448,146 415,157 391 Z"/>
        <path className={cls('Calves')} d="M99 490 C99 512,107 520,121 512 C128 495,129 474,122 454 C108 462,101 475,99 490 Z"/>
        <path className={cls('Calves')} d="M181 490 C181 512,173 520,159 512 C152 495,151 474,158 454 C172 462,179 475,181 490 Z"/>
      </svg>
    </div>

    <div className="hmLegendGrid">
      {label('Chest','Chest')}
      {label('Traps','Traps')}
      {label('UpperBack','Upper back')}
      {label('Lats','Lats')}
      {label('Erectors','Erectors')}
      {label('FrontDelt','Front delts')}
      {label('SideDelt','Side delts')}
      {label('RearDelt','Rear delts')}
      {label('Abs','Abs')}
      {label('Obliques','Obliques')}
      {label('Quads','Quads')}
      {label('Hamstrings','Hamstrings')}
      {label('Adductors','Adductors')}
      {label('Abductors','Abductors')}
      {label('Glutes','Glutes')}
      {label('Calves','Calves')}
      {label('Biceps','Biceps')}
      {label('Triceps','Triceps')}
      {label('Forearms','Forearms')}
    </div>
  </div>
}



function ExerciseSearchSelect({exercises,value,onChange,placeholder='Search exercises...'}:{exercises:Exercise[];value?:number;onChange:(id:number|undefined)=>void;placeholder?:string}) {
  const selected = exercises.find(e=>e.id===value);
  const [q,setQ]=useState(selected?.name || '');
  const [open,setOpen]=useState(false);
  useEffect(()=>{ const s=exercises.find(e=>e.id===value); if(s) setQ(s.name); },[value, exercises.length]);
  const results = exercises.filter(e => `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(q.toLowerCase())).slice(0,8);
  return <div className="searchSelect">
    <input value={q} placeholder={placeholder} onFocus={()=>setOpen(true)} onChange={e=>{setQ(e.target.value);setOpen(true); if(!e.target.value) onChange(undefined)}}/>
    {open && <div className="searchResults">
      {results.length ? results.map(e=><button key={e.id} type="button" onClick={()=>{onChange(e.id);setQ(e.name);setOpen(false);}}>
        <strong>{e.name}</strong><span>{e.muscle} · {e.equipment}</span>
      </button>) : <p>No matching exercises</p>}
    </div>}
  </div>
}

const secondaryWeights: Record<string, Record<string, number>> = {
  Chest: { FrontDelt:.35, Triceps:.30 },
  'Front Delt': { Chest:.20, Triceps:.20 },
  'Side Delt': { Traps:.15 },
  'Rear Delt': { UpperBack:.25, Traps:.15 },
  Traps: { UpperBack:.25, Erectors:.15 },
  'Upper Back': { Lats:.25, RearDelt:.20, Biceps:.20 },
  Lats: { UpperBack:.20, Biceps:.25, Forearms:.15 },
  Erectors: { Glutes:.15, Hamstrings:.15 },
  Abs: { Obliques:.20 },
  Obliques: { Abs:.25, Erectors:.10 },
  Quadriceps: { Adductors:.15, Glutes:.10 },
  Hamstrings: { Glutes:.30, Erectors:.15 },
  Adductors: { Quadriceps:.20, Glutes:.10 },
  Abductors: { Glutes:.35 },
  Calves: {},
  Glutes: { Hamstrings:.25, Abductors:.20, Erectors:.15 },
  Biceps: { Forearms:.20, Lats:.10 },
  Triceps: { FrontDelt:.10, Chest:.10 },
  Forearms: { Biceps:.15 }
};

function muscleKeyFromName(muscle:string) {
  const map: Record<string,string> = {'Upper Back':'UpperBack','Rear Delt':'RearDelt','Side Delt':'SideDelt','Front Delt':'FrontDelt','Quadriceps':'Quads'};
  return map[muscle] || muscle;
}
function addWeightedMuscle(values:Record<string,number>, muscle:string, amount:number, selectedSecondaries:string[] = []) {
  const primary = muscleKeyFromName(muscle);
  if(primary in values) values[primary] += amount;
  Object.entries(secondaryWeights[muscle] || {}).forEach(([key,weight])=>{ if(key in values) values[key] += amount * weight; });
  selectedSecondaries.forEach(m=>{
    const key = muscleKeyFromName(m);
    if(key in values) values[key] += amount * 0.35;
  });
}
function recoveryValuesFromVolume(values:Record<string,number>, exercises:Exercise[], workouts:Workout[], sets:WorkoutSet[]) {
  const out:Record<string,number> = {};
  Object.keys(values).forEach(k=>out[k]=0);
  Object.keys(values).forEach(k=>{
    const ids = exercises.filter(e=>{
      const primary = muscleKeyFromName(e.muscle);
      return primary===k || Object.keys(secondaryWeights[e.muscle]||{}).includes(k);
    }).map(e=>e.id);
    const relevant = sets.filter(s=>ids.includes(s.exerciseId));
    if(!relevant.length){ out[k]=100; return; }
    const latest = [...relevant].sort((a:WorkoutSet,b:WorkoutSet)=>b.createdAt.localeCompare(a.createdAt))[0];
    const days = Math.max(0, (Date.now() - new Date(latest.createdAt).getTime()) / 86400000);
    const recentLoad = Math.min(1, (values[k]||0)/7000);
    out[k] = Math.min(100, Math.max(5, days*28 + (1-recentLoad)*40));
  });
  return out;
}
function recoveryClass(v:number) {
  if (v >= 85) return 'rec4';
  if (v >= 65) return 'rec3';
  if (v >= 40) return 'rec2';
  if (v >= 20) return 'rec1';
  return 'rec0';
}


function durationMinutes(w: Workout) {
  if (!w.startedAt) return 0;
  const end = w.endedAt ? new Date(w.endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(w.startedAt).getTime()) / 60000));
}
function workoutSetsFor(w: Workout, sets: WorkoutSet[]) {
  return sets.filter(s => s.workoutId === w.id);
}
function workoutVolume(w: Workout, sets: WorkoutSet[]) {
  return workoutSetsFor(w, sets).reduce((a,s)=>a+volumeKg(s),0);
}
function detectSetPR(newSet: WorkoutSet, allSets: WorkoutSet[]) {
  const previous = allSets.filter(s=>s.exerciseId===newSet.exerciseId && s.id !== newSet.id && new Date(s.createdAt).getTime() < new Date(newSet.createdAt).getTime());
  if(!previous.length) return 'First logged set';
  const heaviest = Math.max(...previous.map(s=>kgValue(s)));
  const bestVol = Math.max(...previous.map(s=>volumeKg(s)));
  const bestE = Math.max(...previous.map(s=>e1rm(kgValue(s),s.reps)));
  if(kgValue(newSet) > heaviest) return 'New weight PR';
  if(volumeKg(newSet) > bestVol) return 'New set volume PR';
  if(e1rm(kgValue(newSet),newSet.reps) > bestE) return 'New estimated 1RM PR';
  return '';
}

function HomePage({data}:any){
  const {exercises,subtypes,routines,workouts,sets,setPage}=data;
  const weekWorkouts = workoutsThisWeek(workouts);
  const weekSets = sets.filter((s:WorkoutSet)=>weekWorkouts.some((w:Workout)=>w.id===s.workoutId));
  const vol = weekSets.reduce((a:number,s:WorkoutSet)=>a+volumeKg(s),0);
  const lastWorkout = workouts[0];
  const suggestedRoutine = routines.find((r:Routine)=>!r.archived) || routines[0];
  const groups = groupVolumesForWeek(exercises, workouts, sets);
  const maxGroup = Math.max(...Object.values(groups), 1);
  const prs = recentPRItems(exercises, sets);

  return <section className="homeV12">
    <Card cls="hero heroV12">
      <div className="heroTop">
        <div>
          <div className="eyebrow lightText">TODAY</div>
          <h2>{suggestedRoutine ? suggestedRoutine.name : 'Ready to train?'}</h2>
          <p>{lastWorkout ? `Last workout: ${lastWorkout.title} on ${lastWorkout.date}` : 'Build a routine and start your first session.'}</p>
        </div>
        <div className="heroBadge">🔥</div>
      </div>
      <button className="primary glowBtn" onClick={()=>setPage('log')}>Start Workout</button>
    </Card>

    <div className="quickActions quickActionsV12">
      <button onClick={()=>setPage('exercises')}>Exercises</button>
      <button onClick={()=>setPage('subtypes')}>Machines</button>
      <button onClick={()=>setPage('routines')}>Routines</button>
    </div>

    <div className="dashboardGrid">
      <Card cls="glassMetric">
        <span>Weekly Volume</span>
        <strong>{fmtVol(vol)}</strong>
        <em>{weekSets.length} sets this week</em>
      </Card>
      <Card cls="glassMetric">
        <span>Workouts</span>
        <strong>{weekWorkouts.length}</strong>
        <em>this week</em>
      </Card>
      <Card cls="glassMetric">
        <span>Library</span>
        <strong>{exercises.length}</strong>
        <em>{subtypes.length} machine subtypes</em>
      </Card>
      <Card cls="glassMetric">
        <span>Routines</span>
        <strong>{routines.length}</strong>
        <em>templates saved</em>
      </Card>
    </div>

    <Card cls="premiumCard">
      <div className="sectionHeader">
        <h3>Muscle Recovery</h3>
        <button className="textBtn" onClick={()=>setPage('stats')}>Details</button>
      </div>
      <div className="recoveryGrid">
        {Object.entries(groups).map(([group, volume])=>{
          const rec = recoveryLabel(volume);
          return <div className={`recoveryTile ${rec.cls}`} key={group}>
            <div className="recoveryTop"><strong>{group}</strong><span>{rec.label}</span></div>
            <div className="recoveryBar"><b style={{width:`${Math.min(100,(volume/maxGroup)*100)}%`}} /></div>
            <em>{fmtVol(volume)}</em>
          </div>
        })}
      </div>
    </Card>

    <Card cls="premiumCard">
      <div className="sectionHeader">
        <h3>Weekly Body Heat Map</h3>
        <span className="muted miniLabel">Volume intensity</span>
      </div>
      <BodyHeatMap values={muscleHeatValues(exercises, workouts, sets)} exercises={exercises} workouts={workouts} sets={sets} />
      <div className="heatLegend"><span className="heat0"></span>None <span className="heat1"></span>Light <span className="heat2"></span>Moderate <span className="heat3"></span>High <span className="heat4"></span>Very high</div>
    </Card>

    <Card cls="premiumCard">
      <div className="sectionHeader">
        <h3>Recent PR Signals</h3>
        <button className="textBtn" onClick={()=>setPage('progress')}>Progress</button>
      </div>
      {prs.length ? prs.map((item:any)=><div className="prFeedItem" key={item.set.id}>
        <div className="prIcon">🏆</div>
        <div>
          <strong>{item.exercise?.name || 'Exercise'}</strong>
          <span>{item.set.weight}{item.set.unit} × {item.set.reps} · e1RM {e1rm(kgValue(item.set), item.set.reps)}kg</span>
        </div>
      </div>) : <p className="muted">No sets logged yet. PRs will appear here after workouts.</p>}
    </Card>

    <Card cls="premiumCard">
      <div className="sectionHeader">
        <h3>Next Upgrade Preview</h3>
      </div>
      <p className="muted">Coming next: body heat map, exercise GIFs/YouTube demos, and richer exercise cards.</p>
    </Card>
  </section>
}

function Metric({n,l}:any){return <Card cls="metric"><strong>{n}</strong><span>{l}</span></Card>}
function Heat({label,value}:any){return <div className="heat"><span>{label}</span><div><b style={{width:`${Math.min(100,value*14)}%`}}/></div><em>{value}</em></div>}


function SecondaryMusclePicker({primary,value,onChange}:{primary:string;value:string[];onChange:(v:string[])=>void}) {
  const options = muscles.filter(m=>m!==primary && m!=='Other');
  function toggle(m:string){
    onChange(value.includes(m) ? value.filter(x=>x!==m) : [...value,m]);
  }
  return <div className="secondaryMuscleBox">
    <label>Secondary muscles</label>
    <div className="muscleChipGrid">
      {options.map(m=><button type="button" key={m} className={value.includes(m)?'muscleChip active':'muscleChip'} onClick={()=>toggle(m)}>{m}</button>)}
    </div>
  </div>
}
function MusclePills({ex}:{ex:Exercise}) {
  return <Pills><span>Primary: {ex.muscle}</span>{(ex.secondaryMuscles||[]).map(m=><span key={m}>+ {m}</span>)}<span>{ex.equipment}</span></Pills>
}
async function quickCreateExercise(name:string, muscle:string, secondaryMuscles:string[], equip:string) {
  if(!name.trim()) throw new Error('Exercise name required');
  return await db.exercises.add({name:name.trim(),muscle,secondaryMuscles,equipment:equip,createdAt:now()});
}


async function toggleFavouriteExercise(ex:Exercise, refresh:()=>void) {
  if(!ex.id) return;
  await db.exercises.update(ex.id, {favourite: !ex.favourite});
  refresh();
}

function ExercisesPage({data}:any){
  const {exercises,subtypes,sets,refresh,setPage,setSelectedExerciseId,routines,routineExercises}=data;
  const [name,setName]=useState(''); const [muscle,setMuscle]=useState('Side Delt'); const [secondary,setSecondary]=useState<string[]>([]); const [equip,setEquip]=useState('Machine');
  const [search,setSearch]=useState(''); const [filterMuscle,setFilterMuscle]=useState('All'); const [filterEquip,setFilterEquip]=useState('All');
  const [quickRoutineId,setQuickRoutineId]=useState<number|undefined>();
  const [makeSubtype,setMakeSubtype]=useState(false); const [subtypeName,setSubtypeName]=useState(''); const [unit,setUnit]=useState<Unit>('kg');
  const [editingId,setEditingId]=useState<number|undefined>(); const [editName,setEditName]=useState(''); const [editMuscle,setEditMuscle]=useState('Side Delt'); const [editSecondary,setEditSecondary]=useState<string[]>([]); const [editEquip,setEditEquip]=useState('Machine');

  async function add(){
    try{
      const id=await quickCreateExercise(name,muscle,secondary,equip);
      if(makeSubtype && subtypeName.trim()) await db.subtypes.add({exerciseId:id,name:subtypeName.trim(),defaultUnit:unit,settings:[],createdAt:now()});
      if(quickRoutineId){
        const current=routineExercises.filter((r:RoutineExercise)=>r.routineId===quickRoutineId);
        await db.routineExercises.add({routineId:quickRoutineId,exerciseId:id,order:current.length+1,sets:3,reps:'8-12',rest:90,createdAt:now()});
      }
      setName(''); setSecondary([]); setSubtypeName(''); setMakeSubtype(false); refresh();
    }catch(e:any){ alert(e.message || 'Could not create exercise'); }
  }
  async function del(ex:Exercise){ if(!confirm('Delete this exercise, its subtypes, and remove it from routines? Past set history remains.')) return; await db.exercises.delete(ex.id!); const ss=await db.subtypes.where('exerciseId').equals(ex.id!).toArray(); for(const s of ss) await db.subtypes.delete(s.id!); const rs=await db.routineExercises.where('exerciseId').equals(ex.id!).toArray(); for(const r of rs) await db.routineExercises.delete(r.id!); refresh(); }
  function beginEdit(ex:Exercise){ setEditingId(ex.id); setEditName(ex.name); setEditMuscle(ex.muscle); setEditSecondary(ex.secondaryMuscles||[]); setEditEquip(ex.equipment); }
  async function saveEdit(){ if(!editingId) return; await db.exercises.update(editingId,{name:editName,muscle:editMuscle,secondaryMuscles:editSecondary,equipment:editEquip}); setEditingId(undefined); refresh(); }

  const filteredExercises = exercises.filter((ex:Exercise)=>{
    const q = search.toLowerCase();
    const matchesSearch = !q || `${ex.name} ${ex.muscle} ${(ex.secondaryMuscles||[]).join(' ')} ${ex.equipment}`.toLowerCase().includes(q);
    const matchesMuscle = filterMuscle==='All' || ex.muscle===filterMuscle || (ex.secondaryMuscles||[]).includes(filterMuscle);
    const matchesEquip = filterEquip==='All' || ex.equipment===filterEquip;
    return matchesSearch && matchesMuscle && matchesEquip;
  });

  return <section>
    <Card cls="builderHero">
      <div><span className="eyebrow">Exercise Builder</span><h2>Create exercises faster</h2><p className="muted">Add primary muscles, secondary muscles, machines and optionally drop the exercise straight into a routine.</p></div>
    </Card>
    <Card cls="catalogueFilters"><input placeholder="Search catalogue e.g. bench, pulldown, curl..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={filterMuscle} onChange={e=>setFilterMuscle(e.target.value)}><option>All</option>{muscles.map(m=><option key={m}>{m}</option>)}</select><select value={filterEquip} onChange={e=>setFilterEquip(e.target.value)}><option>All</option>{equipment.map(e=><option key={e}>{e}</option>)}</select><p className="muted">{filteredExercises.length} exercises shown · {exercises.length} total</p></Card>
    <Card cls="builderCard">
      <h3>Add Exercise</h3>
      <div className="builderGrid">
        <input placeholder="Exercise name" value={name} onChange={e=>setName(e.target.value)}/>
        <select value={muscle} onChange={e=>{setMuscle(e.target.value); setSecondary(secondary.filter(m=>m!==e.target.value));}}>{muscles.map(m=><option key={m}>{m}</option>)}</select>
        <select value={equip} onChange={e=>setEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select>
      </div>
      <SecondaryMusclePicker primary={muscle} value={secondary} onChange={setSecondary}/>
      <div className="builderOptional">
        <label className="checkLine"><input type="checkbox" checked={makeSubtype} onChange={e=>setMakeSubtype(e.target.checked)}/> Also create machine/subtype</label>
        {makeSubtype&&<div className="builderGrid"><input placeholder="Machine/subtype name e.g. Prime Lateral Raise" value={subtypeName} onChange={e=>setSubtypeName(e.target.value)}/><select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select></div>}
        <label>Add straight to routine</label>
        <select value={quickRoutineId??''} onChange={e=>setQuickRoutineId(e.target.value?Number(e.target.value):undefined)}><option value="">Not now</option>{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
      </div>
      <button className="primary" onClick={add}><Plus/>Save Exercise</button>
    </Card>
    <div className="exerciseListPro">
    {filteredExercises.map((ex:Exercise)=>{ const prs=allTimePRsForExercise(ex.id, sets); return <Card key={ex.id} cls="exerciseCardPro">
      {editingId===ex.id ? <div>
        <input value={editName} onChange={e=>setEditName(e.target.value)}/>
        <div className="builderGrid"><select value={editMuscle} onChange={e=>{setEditMuscle(e.target.value); setEditSecondary(editSecondary.filter(m=>m!==e.target.value));}}>{muscles.map(m=><option key={m}>{m}</option>)}</select><select value={editEquip} onChange={e=>setEditEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select></div>
        <SecondaryMusclePicker primary={editMuscle} value={editSecondary} onChange={setEditSecondary}/>
        <div className="grid2"><button className="primary" onClick={saveEdit}>Save edit</button><button className="secondary" onClick={()=>setEditingId(undefined)}>Cancel</button></div>
      </div> : <div>
        <div className="row">
          <div onClick={()=>{setSelectedExerciseId(ex.id); setPage('exerciseDetail')}} className="tapArea">
            <h3>{ex.name}</h3>
            <MusclePills ex={ex}/>
            <Pills>{ex.favourite&&<span>★ Favourite</span>}<span>{subtypes.filter((s:Subtype)=>s.exerciseId===ex.id).length} machines</span>{prs&&<span>{prs.setCount} sets logged</span>}</Pills>
          </div>
          <div className="iconStack"><button className={ex.favourite?'favBtn active':'favBtn'} onClick={()=>toggleFavouriteExercise(ex,refresh)} title="Favourite for stats"><Star size={18}/></button><button className="smallAction" onClick={()=>beginEdit(ex)}>Edit</button><button className="trash" onClick={()=>del(ex)}><Trash2/></button></div>
        </div>
        {prs && <div className="quickPRs"><span>Heaviest {Math.round(kgValue(prs.heaviest)*10)/10}kg</span><span>Best e1RM {e1rm(kgValue(prs.bestE1RM), prs.bestE1RM.reps)}kg</span></div>}
      </div>}
    </Card>})}
    </div>
  </section>
}

function ExerciseDetailPage({data}:any){
  const {selectedExerciseId,exercises,subtypes,workouts,sets,setPage}=data;
  const ex = exercises.find((e:Exercise)=>e.id===selectedExerciseId);
  if(!ex) return <section><Card><h3>No exercise selected</h3><button className="secondary" onClick={()=>setPage('exercises')}>Back to exercises</button></Card></section>;
  const prs = allTimePRsForExercise(ex.id, sets);
  const sessions = lastSessionsForExercise(ex.id, workouts, sets, 5);
  return <section>
    <Card>
      <button className="secondary mini" onClick={()=>setPage('exercises')}>← Back</button>
      <h2>{ex.name}</h2>
      <Pills><span>{ex.muscle}</span><span>{ex.equipment}</span><span>{subtypes.filter((s:Subtype)=>s.exerciseId===ex.id).length} subtypes</span></Pills>
    </Card>
    <Card>
      <h3>All-time PRs</h3>
      {!prs ? <p className="muted">No sets logged yet.</p> : <div className="summaryGrid">
        <div><strong>{Math.round(kgValue(prs.heaviest)*10)/10}kg</strong><span>Heaviest</span></div>
        <div><strong>{fmtVol(volumeKg(prs.bestVolumeSet))}</strong><span>Best set volume</span></div>
        <div><strong>{e1rm(kgValue(prs.bestE1RM), prs.bestE1RM.reps)}kg</strong><span>Best e1RM</span></div>
        <div><strong>{prs.mostReps.reps}</strong><span>Most reps</span></div>
      </div>}
    </Card>
    <Card>
      <h3>Exercise Notes</h3>
      <textarea placeholder="Technique cues, setup notes, reminders..." defaultValue={ex.notes||''} onBlur={async e=>{await db.exercises.update(ex.id!,{notes:e.target.value});}} />
      <p className="muted">Notes save when you tap away.</p>
    </Card>
    <Card>
      <h3>Last 5 sessions</h3>
      {sessions.length ? sessions.map((row:any)=><div className="sessionCard" key={row.workout.id}>
        <strong>{row.workout.date}</strong>
        <p className="muted">{row.workout.title}</p>
        {row.sets.map((s:WorkoutSet)=><div className="prev" key={s.id}>Set {s.setNumber}: {s.weight}{s.unit} × {s.reps} · {fmtVol(volumeKg(s))}</div>)}
      </div>) : <p className="muted">No sessions yet.</p>}
    </Card>
  </section>
}

function SubtypesPage({data}:any){
  const {exercises,subtypes,refresh}=data;
  const [exerciseId,setExerciseId]=useState<number|undefined>(); const [name,setName]=useState(''); const [unit,setUnit]=useState<Unit>('kg'); const [photo,setPhoto]=useState<Blob|undefined>();
  const [settings,setSettings]=useState<MachineSetting[]>([]); const [label,setLabel]=useState(''); const [type,setType]=useState<SettingType>('dropdown'); const [opts,setOpts]=useState('1,2,3,4,5');
  const [newExName,setNewExName]=useState(''); const [newExMuscle,setNewExMuscle]=useState('Side Delt'); const [newExSecondary,setNewExSecondary]=useState<string[]>([]); const [newExEquip,setNewExEquip]=useState('Machine');

  function addSetting(){ if(!label.trim())return; setSettings([...settings,{id:crypto.randomUUID(),label:label.trim(),type,options:type==='dropdown'?opts.split(',').map(x=>x.trim()):undefined,defaultValue:type==='checkbox'?false:''}]); setLabel(''); }
  async function createExerciseHere(){ try{ const id=await quickCreateExercise(newExName,newExMuscle,newExSecondary,newExEquip); setExerciseId(id); setNewExName(''); setNewExSecondary([]); refresh(); }catch(e:any){ alert(e.message || 'Could not create exercise'); } }
  async function add(){ if(!exerciseId||!name.trim()) return alert('Choose exercise and name'); await db.subtypes.add({exerciseId,name:name.trim(),defaultUnit:unit,photo,settings,createdAt:now()}); setName(''); setPhoto(undefined); setSettings([]); setUnit('kg'); refresh(); }
  async function del(s:Subtype){ if(!confirm('Delete this subtype? Past set logs remain.'))return; await db.subtypes.delete(s.id!); const rs=await db.routineExercises.where('subtypeId').equals(s.id!).toArray(); for(const r of rs) await db.routineExercises.update(r.id!,{subtypeId:undefined}); refresh(); }
  return <section>
    <Card cls="builderHero"><span className="eyebrow">Machine Builder</span><h2>Machines belong to exercises</h2><p className="muted">Search for an exercise, or create one here first, then save the exact machine/subtype with its own unit and settings.</p></Card>
    <Card cls="builderCard">
      <h3>Add Machine/Subtype</h3>
      <ExerciseSearchSelect exercises={exercises} value={exerciseId} onChange={setExerciseId} placeholder="Search exercise for this machine..."/>
      <details className="inlineCreate"><summary>Need a new exercise first?</summary>
        <div className="builderGrid"><input placeholder="New exercise name" value={newExName} onChange={e=>setNewExName(e.target.value)}/><select value={newExMuscle} onChange={e=>setNewExMuscle(e.target.value)}>{muscles.map(m=><option key={m}>{m}</option>)}</select><select value={newExEquip} onChange={e=>setNewExEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select></div>
        <SecondaryMusclePicker primary={newExMuscle} value={newExSecondary} onChange={setNewExSecondary}/>
        <button className="secondary" onClick={createExerciseHere}>Create and select exercise</button>
      </details>
      <input placeholder="e.g. Prime Lateral Raise" value={name} onChange={e=>setName(e.target.value)}/>
      <label>Default unit for this exact machine</label><select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select>
      <label className="upload"><ImagePlus/> Add one machine photo<input hidden type="file" accept="image/*" capture="environment" onChange={e=>setPhoto(e.target.files?.[0])}/></label>{photo&&<img className="preview" src={blobUrl(photo)}/>}
      <h4>Machine settings</h4><div className="builderGrid"><input placeholder="Setting label e.g. Seat Position" value={label} onChange={e=>setLabel(e.target.value)}/><select value={type} onChange={e=>setType(e.target.value as SettingType)}><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="text">Text</option></select>{type==='dropdown'&&<input value={opts} onChange={e=>setOpts(e.target.value)} placeholder="1,2,3,4,5"/>}</div>
      <button className="secondary" onClick={addSetting}>Add Setting</button><Pills>{settings.map(s=><span key={s.id}>{s.label} · {s.type}</span>)}</Pills><button className="primary" onClick={add}>Save Machine</button>
    </Card>
    {subtypes.map((s:Subtype)=>{const ex=exercises.find((e:Exercise)=>e.id===s.exerciseId);return <Card key={s.id} cls="machine"><div>{s.photo?<img src={blobUrl(s.photo)}/>:<div className="placeholder">No photo</div>}</div><div><div className="row"><h3>{s.name}</h3><button className="trash" onClick={()=>del(s)}><Trash2/></button></div><p className="muted">{ex?.name}</p>{ex&&<MusclePills ex={ex}/>}<Pills><span>{s.defaultUnit}</span>{s.settings.map(x=><span key={x.id}>{x.label}</span>)}</Pills></div></Card>})}
  </section>
}

function RoutinesPage({data}:any){
  const {exercises,subtypes,routines,routineExercises,refresh}=data;
  const [routineName,setRoutineName]=useState(''); const [colour,setColour]=useState('#7c3aed'); const [routineId,setRoutineId]=useState<number|undefined>(routines[0]?.id);
  const [exerciseId,setExerciseId]=useState<number|undefined>(); const [subtypeId,setSubtypeId]=useState<number|undefined>(); const [setsN,setSetsN]=useState(4); const [reps,setReps]=useState('8-12'); const [rest,setRest]=useState(90);
  const [newExName,setNewExName]=useState(''); const [newExMuscle,setNewExMuscle]=useState('Side Delt'); const [newExSecondary,setNewExSecondary]=useState<string[]>([]); const [newExEquip,setNewExEquip]=useState('Machine');
  const [newMachineName,setNewMachineName]=useState(''); const [newMachineUnit,setNewMachineUnit]=useState<Unit>('kg');

  async function create(){ if(!routineName.trim())return; const id=await db.routines.add({name:routineName.trim(),color:colour,createdAt:now()}); setRoutineId(id); setRoutineName(''); refresh(); }
  async function createExerciseAndSelect(){ try{ const id=await quickCreateExercise(newExName,newExMuscle,newExSecondary,newExEquip); setExerciseId(id); setNewExName(''); setNewExSecondary([]); refresh(); }catch(e:any){ alert(e.message || 'Could not create exercise'); } }
  async function createMachineForSelected(){ if(!exerciseId||!newMachineName.trim()) return alert('Choose exercise and enter machine name'); const id=await db.subtypes.add({exerciseId,name:newMachineName.trim(),defaultUnit:newMachineUnit,settings:[],createdAt:now()}); setSubtypeId(id); setNewMachineName(''); refresh(); }
  async function add(){ if(!routineId||!exerciseId)return alert('Choose routine and exercise'); const current=routineExercises.filter((r:RoutineExercise)=>r.routineId===routineId); await db.routineExercises.add({routineId,exerciseId,subtypeId,order:current.length+1,sets:setsN,reps,rest,createdAt:now()}); refresh(); }
  async function delRoutine(){ if(!routineId||!confirm('Delete this routine template? Workout history remains.'))return; const items=await db.routineExercises.where('routineId').equals(routineId).toArray(); for(const i of items) await db.routineExercises.delete(i.id!); await db.routines.delete(routineId); setRoutineId(undefined); refresh(); }
  const items=routineExercises.filter((r:RoutineExercise)=>r.routineId===routineId).sort((a: RoutineExercise, b: RoutineExercise)=>a.order-b.order);
  return <section>
    <Card cls="builderHero"><span className="eyebrow">Routine Builder</span><h2>Build while you create</h2><p className="muted">Create a routine, create exercises, add machines and add them to the workout template from one place.</p></Card>
    <div className="builderSplit">
      <Card cls="builderCard"><h3>1. Routine</h3><input placeholder="Routine name" value={routineName} onChange={e=>setRoutineName(e.target.value)}/><div className="colourRow">{colours.map(c=><button key={c} className={colour===c?'colour activeColour':'colour'} style={{background:c}} onClick={()=>setColour(c)}/>)}</div><button className="primary" onClick={create}>Create Routine</button><select value={routineId??''} onChange={e=>setRoutineId(Number(e.target.value))}><option value="">Choose routine</option>{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}</select>{routineId&&<><div className="colourRow">{colours.map(c=><button key={c} className={(routines.find((r:Routine)=>r.id===routineId)?.color||'')===c?'colour activeColour':'colour'} style={{background:c}} onClick={async()=>{await db.routines.update(routineId,{color:c}); refresh();}}/>)}</div><div className="grid3"><button className="secondary mini" onClick={async()=>{ const r = routines.find((x:Routine)=>x.id===routineId); if(!r || !routineId) return; const newId = await db.routines.add({name:r.name + ' Copy', color:r.color, archived:false, createdAt:now()}); const items = routineExercises.filter((x:RoutineExercise)=>x.routineId===routineId).sort((a: RoutineExercise, b: RoutineExercise)=>a.order-b.order); for (const item of items) await db.routineExercises.add({...item, id:undefined, routineId:newId, createdAt:now()}); setRoutineId(newId); refresh(); }}>Duplicate</button><button className="secondary mini" onClick={async()=>{ if(routineId){ await db.routines.update(routineId,{archived:true}); refresh(); }}}>Archive</button><button className="danger mini" onClick={delRoutine}>Delete</button></div></>}</Card>
      <Card cls="builderCard"><h3>2. Exercise</h3><ExerciseSearchSelect exercises={exercises} value={exerciseId} onChange={(id)=>{setExerciseId(id);setSubtypeId(undefined)}} placeholder="Search exercise..."/><details className="inlineCreate"><summary>Create new exercise here</summary><div className="builderGrid"><input placeholder="New exercise name" value={newExName} onChange={e=>setNewExName(e.target.value)}/><select value={newExMuscle} onChange={e=>setNewExMuscle(e.target.value)}>{muscles.map(m=><option key={m}>{m}</option>)}</select><select value={newExEquip} onChange={e=>setNewExEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select></div><SecondaryMusclePicker primary={newExMuscle} value={newExSecondary} onChange={setNewExSecondary}/><button className="secondary" onClick={createExerciseAndSelect}>Create and select</button></details></Card>
      <Card cls="builderCard"><h3>3. Machine + Sets</h3><select value={subtypeId??''} onChange={e=>setSubtypeId(e.target.value?Number(e.target.value):undefined)}><option value="">Optional machine/subtype</option>{subtypes.filter((s:Subtype)=>!exerciseId||s.exerciseId===exerciseId).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}</select><details className="inlineCreate"><summary>Create machine for selected exercise</summary><div className="builderGrid"><input placeholder="Machine/subtype name" value={newMachineName} onChange={e=>setNewMachineName(e.target.value)}/><select value={newMachineUnit} onChange={e=>setNewMachineUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select></div><button className="secondary" onClick={createMachineForSelected}>Create and select machine</button></details><div className="grid3"><label>Sets<input type="number" inputMode="decimal" value={setsN} onChange={e=>setSetsN(Number(e.target.value))}/></label><label>Reps<input value={reps} onChange={e=>setReps(e.target.value)}/></label><label>Rest<input type="number" inputMode="decimal" value={rest} onChange={e=>setRest(Number(e.target.value))}/></label></div><button className="primary" onClick={add}>Add to Routine</button></Card>
    </div>
    {items.map((it:RoutineExercise)=>{const ex=exercises.find((e:Exercise)=>e.id===it.exerciseId); const st=subtypes.find((s:Subtype)=>s.id===it.subtypeId); return <Card key={it.id} cls="machine routineItemPro">{st?.photo?<img src={blobUrl(st.photo)}/>:<div className="placeholder">{it.order}</div>}<div><div className="row"><h3>{it.order}. {ex?.name}</h3><div className="iconStack"><button className="smallAction" onClick={async()=>{ await db.routineExercises.update(it.id!,{order:Math.max(1,it.order-1)}); refresh();}}>↑</button><button className="smallAction" onClick={async()=>{ await db.routineExercises.update(it.id!,{order:it.order+1}); refresh();}}>↓</button><button className="trash" onClick={async()=>{await db.routineExercises.delete(it.id!);refresh();}}><Trash2/></button></div></div><p className="muted">{st?.name||'No machine selected'}</p>{ex&&<MusclePills ex={ex}/>}<Pills><span>{it.sets} sets</span><span>{it.reps}</span><span>{it.rest}s</span></Pills></div></Card>})}
  </section>
}

function mondayOfWeek(d: Date) {
  const out = new Date(d);
  const day = out.getDay();
  const diff = out.getDate() - day + (day === 0 ? -6 : 1);
  out.setDate(diff);
  out.setHours(0,0,0,0);
  return out;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}
function dateKey(date: Date) {
  return date.toISOString().slice(0,10);
}


function suggestedReplacementsFor(ex:Exercise, exercises:Exercise[]) {
  const samePrimary = exercises.filter(e=>e.id!==ex.id && e.muscle===ex.muscle);
  const sharedSecondary = exercises.filter(e=>e.id!==ex.id && e.muscle!==ex.muscle && ((e.secondaryMuscles||[]).includes(ex.muscle) || (ex.secondaryMuscles||[]).includes(e.muscle)));
  return [...samePrimary, ...sharedSecondary].slice(0, 8);
}
function recoveryForMuscleFromHistory(muscle:string, exercises:Exercise[], workouts:Workout[], sets:WorkoutSet[]) {
  const ids = exercises.filter(e=>e.muscle===muscle || (e.secondaryMuscles||[]).includes(muscle)).map(e=>e.id);
  const relevant = sets.filter(s=>ids.includes(s.exerciseId));
  if(!relevant.length) return {score:100,label:'Recovered',days:999,volume:0,sets:0};
  const latest = [...relevant].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const days = Math.max(0,(Date.now()-new Date(latest.createdAt).getTime())/86400000);
  const recent = relevant.filter(s=>Date.now()-new Date(s.createdAt).getTime()<4*86400000);
  const volume = recent.reduce((a,s)=>a+volumeKg(s),0);
  const fatiguePenalty = Math.min(35, volume/350);
  const score = Math.max(0, Math.min(100, days*28 + 30 - fatiguePenalty));
  const label = score<35?'Recovering':score<60?'Fatigued':score<80?'Almost ready':'Ready';
  return {score,label,days,volume,sets:recent.length};
}

function LogPage({data}:any){
  const {settings,exercises,subtypes,routines,routineExercises,workouts,sets,replacements,activeWorkout,setActiveWorkoutId,refresh}=data;
  const [timer,setTimer]=useState<number|undefined>(); 
  const [rest,setRest]=useState(90); 
  const [,setTick]=useState(0);
  const [customMode,setCustomMode]=useState(false);
  const [customItems,setCustomItems]=useState<RoutineExercise[]>([]);
  const [addExerciseId,setAddExerciseId]=useState<number|undefined>();
  const [addSubtypeId,setAddSubtypeId]=useState<number|undefined>();
  const [newVariantName,setNewVariantName]=useState('');
  const [newVariantUnit,setNewVariantUnit]=useState<Unit>(settings.unit || 'kg');
  const [newVariantPhoto,setNewVariantPhoto]=useState<Blob|undefined>();
  const [quickRoutineName,setQuickRoutineName]=useState('');

  useEffect(()=>{const i=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(i)},[]);
  useEffect(()=>{ let lock:any; async function requestLock(){ try{ if('wakeLock' in navigator && activeWorkout){ lock = await (navigator as any).wakeLock.request('screen'); } }catch{} } requestLock(); return ()=>{ try{lock?.release?.()}catch{} }; },[activeWorkout?.id]);

  async function startRoutine(routineId:number){ const r=routines.find((x:Routine)=>x.id===routineId); const id=await db.workouts.add({routineId,title:r?.name||'Workout',date:today(),startedAt:now()}); setCustomMode(false); setActiveWorkoutId(id); refresh(); }
  async function startEmpty(){ const id=await db.workouts.add({title:'New Workout',date:today(),startedAt:now()}); setCustomMode(true); setActiveWorkoutId(id); refresh(); }
  async function startNewRoutineNow(){
    const name = quickRoutineName.trim() || `Routine ${new Date().toLocaleDateString([], {day:'numeric',month:'short'})}`;
    const rid = await db.routines.add({name, color:'#2563eb', archived:false, createdAt:now()});
    const id=await db.workouts.add({routineId:rid,title:name,date:today(),startedAt:now()});
    setQuickRoutineName('');
    setCustomMode(false);
    setActiveWorkoutId(id);
    refresh();
  }
  async function finish(){ 
    if(!activeWorkout?.id)return; 
    await db.workouts.update(activeWorkout.id,{endedAt:now()}); 
    if(customMode && customItems.length && confirm('Save this as a reusable routine?')){
      const name = prompt('Routine name?', activeWorkout.title || 'Custom Routine') || 'Custom Routine';
      const rid = await db.routines.add({name, color:'#2563eb', archived:false, createdAt:now()});
      for (const item of customItems) await db.routineExercises.add({...item, id:undefined, routineId:rid, createdAt:now()});
    }
    setActiveWorkoutId(undefined); setCustomItems([]); setCustomMode(false); refresh(); 
  }
  async function addCustomExercise(){
    if(!addExerciseId) return alert('Choose exercise');
    const nextOrder = customMode || !activeWorkout?.routineId 
      ? customItems.length+1 
      : routineExercises.filter((r:RoutineExercise)=>r.routineId===activeWorkout.routineId).length+1;
    const item:RoutineExercise = {id:Date.now(), routineId:activeWorkout?.routineId||0, exerciseId:addExerciseId, subtypeId:addSubtypeId, order:nextOrder, sets:3, reps:'8-12', rest:90, createdAt:now()};
    if(activeWorkout?.routineId && !customMode){
      await db.routineExercises.add({...item, id:undefined, routineId:activeWorkout.routineId});
      refresh();
    } else {
      setCustomItems([...customItems,item]);
    }
    setAddExerciseId(undefined); setAddSubtypeId(undefined);
  }
  async function createVariantAndAdd(){
    if(!addExerciseId) return alert('Choose exercise first');
    if(!newVariantName.trim()) return alert('Enter a variant or machine name');
    const subtypeId = await db.subtypes.add({exerciseId:addExerciseId,name:newVariantName.trim(),defaultUnit:newVariantUnit,photo:newVariantPhoto,settings:[],createdAt:now()});
    setAddSubtypeId(subtypeId);
    const nextOrder = customMode || !activeWorkout?.routineId 
      ? customItems.length+1 
      : routineExercises.filter((r:RoutineExercise)=>r.routineId===activeWorkout.routineId).length+1;
    const item:RoutineExercise = {id:Date.now(), routineId:activeWorkout?.routineId||0, exerciseId:addExerciseId, subtypeId, order:nextOrder, sets:3, reps:'8-12', rest:90, createdAt:now()};
    if(activeWorkout?.routineId && !customMode){
      await db.routineExercises.add({...item, id:undefined, routineId:activeWorkout.routineId});
    } else {
      setCustomItems([...customItems,item]);
    }
    setNewVariantName(''); setNewVariantPhoto(undefined); setAddExerciseId(undefined); setAddSubtypeId(undefined);
    refresh();
  }

  if(!activeWorkout) return <section className="trainStart">
    <Card cls="hero trainHero"><h2>Start Training</h2><p>No setup maze. Start a fresh workout, create a new routine on the spot, or tap an existing routine to begin immediately.</p></Card>
    <Card cls="startActions">
      <button className="primary bigStart" onClick={startEmpty}>Start New Workout</button>
      <div className="quickRoutineCreate">
        <input value={quickRoutineName} onChange={e=>setQuickRoutineName(e.target.value)} placeholder="Optional new routine name"/>
        <button className="secondary" onClick={startNewRoutineNow}>Start + Save as Routine</button>
      </div>
    </Card>
    <Card><h3>Existing routines</h3><div className="routineStartGrid">{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><button key={r.id} className="routineStartCard" onClick={()=>startRoutine(r.id!)}><span style={{background:r.color}}/><strong>{r.name}</strong><em>Tap to start</em></button>)}</div></Card>
    <Card><h3>Timeout protection</h3><p className="muted">Sets save immediately. If the page refreshes, LiftLog will try to resume your unfinished workout. During workouts, screen wake lock is requested where your browser supports it.</p></Card>
  </section>;
  const routineItems=routineExercises.filter((r:RoutineExercise)=>r.routineId===activeWorkout.routineId).sort((a:RoutineExercise,b:RoutineExercise)=>a.order-b.order);
  const items=customMode || !activeWorkout.routineId ? customItems : routineItems;
  const left = timer ? Math.max(0, rest - Math.floor((Date.now()-timer)/1000)) : rest;

  return <section className="workoutV15">
    <Card cls="workoutHeaderSticky"><div className="row"><div><h3>{activeWorkout.title}</h3><p className="muted">Started {new Date(activeWorkout.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><button className="finishBtn" onClick={finish}>Finish</button></div></Card>
    <div className="floatingTimer smartTimer"><strong>{left}s</strong><button onClick={()=>setTimer(Date.now())}>Reset</button><button onClick={()=>setTimer((timer||Date.now())-15000)}>+15</button></div>
    <Card cls="addExercisePanel workoutVariantCreator">
      <h3>Add exercise or variant</h3>
      <p className="muted">Add exercises while training. You can also create a new machine variant with a photo and save it permanently for future workouts.</p>
      <ExerciseSearchSelect exercises={exercises} value={addExerciseId} onChange={(id)=>{setAddExerciseId(id);setAddSubtypeId(undefined)}} placeholder="Search exercise to add..." />
      <select value={addSubtypeId??''} onChange={e=>setAddSubtypeId(e.target.value?Number(e.target.value):undefined)}>
        <option value="">Optional existing variant / machine</option>
        {subtypes.filter((s:Subtype)=>!addExerciseId||s.exerciseId===addExerciseId).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}
      </select>
      <div className="grid2">
        <button className="secondary" onClick={addCustomExercise}>+ Add selected</button>
      </div>
      <details className="inlineCreate">
        <summary>Create new machine variant during workout</summary>
        <input value={newVariantName} onChange={e=>setNewVariantName(e.target.value)} placeholder="Variant name e.g. Cybex Leg Extension"/>
        <select value={newVariantUnit} onChange={e=>setNewVariantUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select>
        <label className="upload"><ImagePlus/> Add machine image<input hidden type="file" accept="image/*" capture="environment" onChange={e=>setNewVariantPhoto(e.target.files?.[0])}/></label>
        {newVariantPhoto&&<img className="preview" src={blobUrl(newVariantPhoto)}/>}
        <button className="primary" onClick={createVariantAndAdd}>Save variant + add to workout</button>
      </details>
    </Card>
    {items.map((it:RoutineExercise)=>{ const ex=exercises.find((e:Exercise)=>e.id===it.exerciseId); if(!ex) return null; const rep=replacements.find((r:WorkoutReplacement)=>r.workoutId===activeWorkout.id&&r.routineExerciseId===it.id);
      const actualEx=rep ? exercises.find((e:Exercise)=>e.id===rep.replacementExerciseId) || ex : ex;
      return <Logger key={it.id} item={it} originalEx={ex} ex={actualEx} replacement={rep} allExercises={exercises} subtypes={subtypes.filter((s:Subtype)=>s.exerciseId===actualEx?.id)} initialSubtype={subtypes.find((s:Subtype)=>s.id===it.subtypeId)} workout={activeWorkout} workouts={workouts} sets={sets} defaultUnit={settings.unit} refresh={refresh} onSave={()=>setTimer(Date.now())}/> })}
  </section>
}

function previousSets(exerciseId:number, subtypeId:number|undefined, workout:Workout, workouts:Workout[], sets:WorkoutSet[]){
  const past=workouts.filter(w=>w.id!==workout.id&&w.date<workout.date).sort((a: Workout, b: Workout)=>b.date.localeCompare(a.date));
  for(const w of past){const found=sets.filter(s=>s.workoutId===w.id&&s.exerciseId===exerciseId&&(subtypeId?s.subtypeId===subtypeId:true)).sort((a: WorkoutSet, b: WorkoutSet)=>a.setNumber-b.setNumber); if(found.length)return found}
  return [];
}
function Logger({item,ex,originalEx,replacement,allExercises,subtypes,initialSubtype,workout,workouts,sets,defaultUnit,refresh,onSave}:any){
  const [swapOpen,setSwapOpen]=useState(false); const [sid,setSid]=useState<number|undefined>(initialSubtype?.id); const subtype=subtypes.find((s:Subtype)=>s.id===sid)||initialSubtype;
  const [unit,setUnit]=useState<Unit>(subtype?.defaultUnit||defaultUnit); const [extra,setExtra]=useState(0); const [values,setValues]=useState<Record<string,string|boolean>>({}); const [prMessage,setPrMessage]=useState('');
  useEffect(()=>{const out:Record<string,string|boolean>={}; subtype?.settings?.forEach((s:MachineSetting)=>out[s.id]=s.defaultValue??(s.type==='checkbox'?false:'')); setValues(out); setUnit(subtype?.defaultUnit||defaultUnit)},[sid]);
  const prev=previousSets(ex.id,subtype?.id,workout,workouts,sets);
  const todaySets=sets.filter((s:WorkoutSet)=>s.workoutId===workout.id&&s.exerciseId===ex.id&&(subtype?.id?s.subtypeId===subtype.id:true));

  async function applySwap(newExerciseId:number){
    if(!workout?.id || !item?.id || !originalEx?.id) return;
    const existing = replacement;
    if(existing?.id) await db.replacements.update(existing.id,{replacementExerciseId:newExerciseId});
    else await db.replacements.add({workoutId:workout.id,routineExerciseId:item.id,originalExerciseId:originalEx.id,replacementExerciseId:newExerciseId,createdAt:now()});
    setSwapOpen(false); refresh();
  }
  async function clearSwap(){
    if(replacement?.id){ await db.replacements.delete(replacement.id); refresh(); }
  }
  async function save(n:number){
    const w=(document.getElementById(`w-${item.id}-${n}`) as HTMLInputElement).value; 
    const r=(document.getElementById(`r-${item.id}-${n}`) as HTMLInputElement).value; 
    const rir=(document.getElementById(`rir-${item.id}-${n}`) as HTMLInputElement).value; 
    if(!r)return alert('Enter reps'); 
    const newRecord: WorkoutSet = {workoutId:workout.id,exerciseId:ex.id,subtypeId:subtype?.id,setNumber:n,weight:Number(w||0),reps:Number(r),unit,rir:rir?Number(rir):undefined,completed:true,settingValues:values,createdAt:now()};
    const id = await db.sets.add(newRecord);
    const pr = detectSetPR({...newRecord,id}, sets);
    if(pr) setPrMessage(`🏆 ${pr}`);
    onSave(); refresh();
  }
  return <Card cls="loggerV15">
    <details open>
      <summary><div className="loggerTitle"><span>{subtype?.photo?<img src={blobUrl(subtype.photo)}/>:<Dumbbell/>}</span><div><h3>{ex.name}</h3><p>{replacement?`Replaces ${originalEx?.name} today`:(subtype?.name||'No subtype selected')}</p></div></div></summary>
      <div className="swapPanel">
        <button className="secondary mini" onClick={()=>setSwapOpen(!swapOpen)}>Replace Exercise Today</button>
        {replacement&&<button className="secondary mini" onClick={clearSwap}>Use original</button>}
      </div>
      {swapOpen&&<div className="swapChoices">
        {suggestedReplacementsFor(originalEx||ex, allExercises||[]).map((s:Exercise)=><button key={s.id} onClick={()=>applySwap(s.id!)}><strong>{s.name}</strong><span>{s.muscle} · {(s.secondaryMuscles||[]).join(', ')}</span></button>)}
      </div>}
      <div className="grid2"><label>Variant / machine<select value={sid??''} onChange={e=>setSid(e.target.value?Number(e.target.value):undefined)}><option value="">No variant</option>{subtypes.map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}</select></label><label>Unit{!subtype?<select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select>:<div className="unitLocked">{unit}</div>}</label></div>
      <div className="rirExplainer"><strong>RIR</strong> = reps in reserve. Example: RIR 2 means you could have done about 2 more reps.</div>
      {prMessage && <div className="prToastInline">{prMessage}</div>}
      <div className="setTableV15">
        <div className="setHeaderV15"><span>Set</span><span>Previous</span><span>Weight</span><span>Reps</span><span>RIR</span><span></span></div>
        {Array.from({length:item.sets+extra}).map((_,i)=>{
          const n=i+1; const p=prev.find((x:WorkoutSet)=>x.setNumber===n); const saved=todaySets.find((s:WorkoutSet)=>s.setNumber===n);
          const pw=p?Math.round(convert(p.weight,p.unit,unit)*10)/10:undefined;
          return <div className={saved?'setLineV15 completedSet':'setLineV15'} key={n}>
            <strong>{n}</strong><small>{p?`${pw}${unit} × ${p.reps}`:'—'}</small>
            <input id={`w-${item.id}-${n}`} defaultValue={saved?String(saved.weight):(pw?String(pw):'')} placeholder={unit} type="number" inputMode="decimal" step=".5"/>
            <input id={`r-${item.id}-${n}`} defaultValue={saved?String(saved.reps):(p?String(p.reps):'')} placeholder="reps" type="number" inputMode="numeric"/>
            <input id={`rir-${item.id}-${n}`} defaultValue={saved?.rir!==undefined?String(saved.rir):''} placeholder="RIR" type="number" inputMode="decimal" step=".5"/>
            <button onClick={()=>save(n)}>{saved?'✓':'Save'}</button>
          </div>
        })}
      </div>
      <button className="secondary mini" onClick={()=>setExtra(extra+1)}>+ Add Set</button>
    </details>
  </Card>
}
function CalendarPage({data}:any){
  const {routines,workouts,sets,plannedWorkouts,refresh}=data;
  const [weekStart,setWeekStart]=useState<Date>(mondayOfWeek(new Date()));
  const [selectedRoutine,setSelectedRoutine]=useState<number|undefined>(routines.find((r:Routine)=>!r.archived)?.id);
  const days=Array.from({length:7}).map((_,i)=>addDays(weekStart,i));
  const weekLabel = `${days[0].toLocaleDateString([], {day:'numeric',month:'short'})} - ${days[6].toLocaleDateString([], {day:'numeric',month:'short'})}`;

  async function planRoutine(date:string){
    if(!selectedRoutine) return alert('Choose a routine first');
    await db.plannedWorkouts.add({routineId:selectedRoutine, type:'workout', date, createdAt:now()});
    refresh();
  }
  async function removePlan(id:number|undefined){
    if(!id) return;
    await db.plannedWorkouts.delete(id);
    refresh();
  }
  async function planRest(date:string){
    await db.plannedWorkouts.add({type:'rest', date, note:'Rest day', createdAt:now()});
    refresh();
  }
  async function movePlan(p:PlannedWorkout, days:number){
    if(!p.id) return;
    const d = new Date(p.date); d.setDate(d.getDate()+days);
    await db.plannedWorkouts.update(p.id,{date:d.toISOString().slice(0,10)});
    refresh();
  }

  return <section>
    <Card cls="premiumCard calendarToolbar">
      <div className="calendarTop">
        <button className="smallAction" onClick={()=>setWeekStart(addDays(weekStart,-7))}>← Previous</button>
        <div><h3>{weekLabel}</h3><p className="muted">Monday to Sunday</p></div>
        <button className="smallAction" onClick={()=>setWeekStart(addDays(weekStart,7))}>Next →</button>
      </div>
      <button className="secondary mini" onClick={()=>setWeekStart(mondayOfWeek(new Date()))}>This Week</button>
      <label>Routine to plan
        <select value={selectedRoutine??''} onChange={e=>setSelectedRoutine(Number(e.target.value))}>
          {routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
    </Card>
    <div className="weekCalendar">
      {days.map(dayObj=>{
        const day=dateKey(dayObj);
        const ws=workouts.filter((w:Workout)=>w.date===day);
        const plans=plannedWorkouts.filter((p:PlannedWorkout)=>p.date===day);
        return <Card key={day} cls={day===today()?'weekDay todayWeek':'weekDay'}>
          <div className="weekDayHead"><span>{dayObj.toLocaleDateString([], {weekday:'short'})}</span><strong>{dayObj.getDate()}</strong></div>
          <div className="dayPlanButtons"><button className="addPlanBtn" onClick={()=>planRoutine(day)}>+ Plan</button><button className="restPlanBtn" onClick={()=>planRest(day)}>Rest</button></div>
          {plans.map((p:PlannedWorkout)=>{ 
            if(p.type==='rest') return <div className="restEventV28" key={p.id}><em>Rest Day</em><strong>Recovery</strong><div className="planMoveBtns"><button onClick={()=>movePlan(p,-1)}>←</button><button onClick={()=>movePlan(p,1)}>→</button><button onClick={()=>removePlan(p.id)}>Remove</button></div></div>;
            const r=routines.find((x:Routine)=>x.id===p.routineId); 
            return <div className="plannedEventV15" style={{borderColor:r?.color||'#0f172a', color:r?.color||'#0f172a'}} key={p.id}><em>Planned</em><strong>{r?.name||'Routine'}</strong><div className="planMoveBtns"><button onClick={()=>movePlan(p,-1)}>←</button><button onClick={()=>movePlan(p,1)}>→</button><button onClick={()=>removePlan(p.id)}>Remove</button></div></div> 
          })}
          {ws.map((w:Workout)=>{ const r=routines.find((x:Routine)=>x.id===w.routineId); const ss=sets.filter((s:WorkoutSet)=>s.workoutId===w.id); const vol=ss.reduce((a:number,s:WorkoutSet)=>a+volumeKg(s),0); return <div className="completedEventV15" style={{background:r?.color||'#0f172a'}} key={w.id}><em>Completed</em><strong>{r?.name||w.title}</strong><span>{ss.length} sets · {fmtVol(vol)}</span></div> })}
        </Card>
      })}
    </div>
  </section>
}

function ProgressLineChart({points,unit,label}:{points:{date:string;value:number}[];unit:string;label:string}) {
  if(points.length < 2) return <p className="muted">Log at least two sessions to show a graph.</p>;
  const w=320, h=150, pad=24;
  const vals=points.map(p=>p.value);
  const min=Math.min(...vals), max=Math.max(...vals);
  const range=Math.max(1,max-min);
  const coords=points.map((p,i)=>{
    const x=pad + (i/(points.length-1))*(w-pad*2);
    const y=h-pad - ((p.value-min)/range)*(h-pad*2);
    return `${x},${y}`;
  }).join(' ');
  return <div className="progressChart">
    <div className="chartTop"><strong>{label}</strong><span>{Math.round(points[points.length-1].value*10)/10}{unit}</span></div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p,i)=>{ const x=pad + (i/(points.length-1))*(w-pad*2); const y=h-pad - ((p.value-min)/range)*(h-pad*2); return <circle key={i} cx={x} cy={y} r="4" fill="currentColor"/> })}
    </svg>
  </div>
}

function StatsPage({data}:any){
  const {settings,exercises,workouts,sets}=data;
  const favouriteExercises = exercises.filter((e:Exercise)=>e.favourite);
  const graphExercises = favouriteExercises.length ? favouriteExercises : exercises;
  const [showOnlyFavourites,setShowOnlyFavourites]=useState(true);
  const availableExercises = showOnlyFavourites && favouriteExercises.length ? favouriteExercises : exercises;
  const [eid,setEid]=useState<number|undefined>(availableExercises[0]?.id || exercises[0]?.id);
  const selectedExercise = exercises.find((e:Exercise)=>e.id===eid);
  const filtered=sets.filter((s:WorkoutSet)=>s.exerciseId===eid).sort((a:WorkoutSet,b:WorkoutSet)=>a.createdAt.localeCompare(b.createdAt));
  const weeklyVolumes = weeklyVolumeByBucket(exercises, workouts, sets);
  const totalWeeklyVolume = Object.values(weeklyVolumes).reduce((a,b)=>a+b,0);
  const maxVolume = Math.max(...Object.values(weeklyVolumes), 1);
  const points = filtered.map((s:WorkoutSet)=>({date:s.createdAt.slice(0,10), value:e1rm(convert(s.weight,s.unit,settings.unit),s.reps)})).slice(-12);
  const weightPoints = filtered.map((s:WorkoutSet)=>({date:s.createdAt.slice(0,10), value:convert(s.weight,s.unit,settings.unit)})).slice(-12);

  return <section>
    <Card>
      <h3>Weekly Volume by Muscle Group</h3>
      <p className="muted">Spider chart shows this week's training volume normalised to kg.</p>
      <SpiderChart values={weeklyVolumes}/>
      <div className="volumeList">
        {Object.entries(weeklyVolumes).map(([group, volume])=>
          <div className="volumeRow" key={group}>
            <span>{group}</span>
            <div><b style={{width:`${Math.min(100,(volume/maxVolume)*100)}%`}}/></div>
            <em>{fmtVol(volume)}</em>
          </div>
        )}
      </div>
      <div className="summaryStat">Total weekly volume: <strong>{fmtVol(totalWeeklyVolume)}</strong></div>
    </Card>

    <Card>
      <h3>Exercise Progression Graphs</h3>
      <div className="favStatsHeader">
        <label className="checkLine"><input type="checkbox" checked={showOnlyFavourites} onChange={e=>{setShowOnlyFavourites(e.target.checked); const list=e.target.checked&&favouriteExercises.length?favouriteExercises:exercises; setEid(list[0]?.id);}}/> Show favourites only</label>
        <span>{favouriteExercises.length} favourites</span>
      </div>
      {favouriteExercises.length===0 && <p className="muted">No favourites yet. Star exercises in the Exercise Library to make this list cleaner.</p>}
      <ExerciseSearchSelect exercises={availableExercises} value={eid} onChange={setEid} placeholder="Search favourite exercise to graph..."/>
      {selectedExercise && <div className={selectedExercise.favourite?'favStatsButton active':'favStatsButton'}>{selectedExercise.favourite?'★ Favourite exercise':'☆ Not favourited'}</div>}
      <ProgressLineChart points={points} unit={settings.unit} label="Estimated 1RM trend"/>
      <ProgressLineChart points={weightPoints} unit={settings.unit} label="Logged weight trend"/>
      {filtered.length ? filtered.slice(-8).reverse().map((s:WorkoutSet)=>
        <div className="prev" key={s.id}>
          {new Date(s.createdAt).toLocaleDateString([], {day:'numeric',month:'short'})} · Set {s.setNumber}: {Math.round(convert(s.weight,s.unit,settings.unit)*10)/10}{settings.unit} × {s.reps} · e1RM {e1rm(convert(s.weight,s.unit,settings.unit),s.reps)}{settings.unit}
        </div>
      ) : <p className="muted">No sets logged for this exercise yet.</p>}
    </Card>
  </section>
}

function SpiderChart({values}:{values:Record<string,number>}) {
  const labels = Object.keys(values);
  const nums = Object.values(values);
  const max = Math.max(...nums, 1);
  const size = 280;
  const cx = size/2;
  const cy = size/2;
  const radius = 92;
  const rings = [0.25,0.5,0.75,1];

  const pointFor = (index:number, factor:number) => {
    const angle = -Math.PI/2 + (index * 2 * Math.PI / labels.length);
    return [cx + Math.cos(angle)*radius*factor, cy + Math.sin(angle)*radius*factor];
  };

  const polygon = (factor:number) => labels.map((_,i)=>pointFor(i,factor).join(',')).join(' ');
  const dataPoints = labels.map((_,i)=>pointFor(i, (nums[i]||0)/max).join(',')).join(' ');

  return <div className="spiderWrap">
    <svg viewBox={`0 0 ${size} ${size}`} className="spider">
      {rings.map(r=><polygon key={r} points={polygon(r)} className="spiderRing"/>)}
      {labels.map((_,i)=>{
        const [x,y]=pointFor(i,1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="spiderAxis"/>
      })}
      <polygon points={dataPoints} className="spiderData"/>
      {labels.map((label,i)=>{
        const [x,y]=pointFor(i,1.23);
        return <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="spiderLabel">{label}</text>
      })}
      {labels.map((label,i)=>{
        const [x,y]=pointFor(i, (nums[i]||0)/max);
        return <circle key={label} cx={x} cy={y} r="4" className="spiderDot"/>
      })}
    </svg>
  </div>
}



type MealQuality = 'Great' | 'Okay' | 'Off-track';
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Other';
type MealLog = { id:string; date:string; time:string; type:MealType; title:string; notes?:string; quality:MealQuality; proteinIncluded:boolean; fruitVegIncluded:boolean };
type DailyNutritionLog = { date:string; waterMl:number; creatineTaken:boolean; creatineGrams:number; caffeineMg:number; caffeineLastAt?:string; proteinServings?:number; proteinTarget?:number; meals:MealLog[]; reflection?:string };

const NUTRITION_STORAGE_KEY = 'liftlog-nutrition-accountability-v1';
const nutritionToday = () => new Date().toISOString().slice(0,10);
const nutritionUid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()+Math.random()));

function emptyNutritionDay(date:string): DailyNutritionLog {
  return {date, waterMl:0, creatineTaken:false, creatineGrams:5, caffeineMg:0, meals:[], reflection:''};
}
function loadNutritionLogs(): Record<string, DailyNutritionLog> {
  try { const raw = localStorage.getItem(NUTRITION_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveNutritionLogs(logs:Record<string, DailyNutritionLog>) {
  localStorage.setItem(NUTRITION_STORAGE_KEY, JSON.stringify(logs));
}
function downloadNutritionJson(data:any, filename:string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  a.download = filename;
  a.click();
}


function nutritionScoreV19(day: DailyNutritionLog) {
  const protein = day.proteinServings ?? day.meals.filter(m=>m.proteinIncluded).length;
  const target = day.proteinTarget ?? 3;
  let score = 0;
  if (day.waterMl >= 2000) score += 25;
  if (day.creatineTaken) score += 20;
  if (protein >= target) score += 25;
  if (day.meals.length >= 3) score += 20;
  if ((day.reflection || '').trim().length > 0) score += 10;
  return Math.min(100, score);
}
function nutritionHabitsV20(day: DailyNutritionLog) {
  const protein = day.proteinServings ?? day.meals.filter(m=>m.proteinIncluded).length;
  const target = day.proteinTarget ?? 3;
  return [
    {key:'water', label:'Water', done: day.waterMl >= 2000, detail:`${day.waterMl}/2000 ml`},
    {key:'creatine', label:'Creatine', done: day.creatineTaken, detail: day.creatineTaken ? 'Taken' : 'Pending'},
    {key:'protein', label:'Protein', done: protein >= target, detail:`${protein}/${target}`},
    {key:'meals', label:'Meals', done: day.meals.length >= 3, detail:`${day.meals.length}/3`},
    {key:'reflection', label:'Reflect', done: (day.reflection || '').trim().length > 0, detail: (day.reflection || '').trim() ? 'Done' : 'Pending'}
  ];
}
function normaliseNutritionDay(day: DailyNutritionLog): DailyNutritionLog {
  return {
    ...day,
    proteinServings: day.proteinServings ?? day.meals.filter(m=>m.proteinIncluded).length,
    proteinTarget: day.proteinTarget ?? 3,
    caffeineLastAt: day.caffeineLastAt ?? ''
  };
}
function NutritionPage(){
  const [logs,setLogs]=useState<Record<string, DailyNutritionLog>>({});
  const [date,setDate]=useState(nutritionToday());
  const rawDay = logs[date] || emptyNutritionDay(date);
  const day = normaliseNutritionDay(rawDay);
  const [mealDraft,setMealDraft]=useState({type:'Lunch' as MealType,title:'',notes:'',quality:'Okay' as MealQuality,proteinIncluded:true,fruitVegIncluded:false});

  useEffect(()=>{setLogs(loadNutritionLogs())},[]);
  function updateDay(next:DailyNutritionLog){const updated={...logs,[date]:normaliseNutritionDay(next)}; setLogs(updated); saveNutritionLogs(updated);}
  function addWater(amount:number){updateDay({...day,waterMl:Math.max(0,day.waterMl+amount)});}
  function addCaffeine(amount:number){updateDay({...day,caffeineMg:Math.max(0,day.caffeineMg+amount),caffeineLastAt:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});}
  function toggleCreatine(){updateDay({...day,creatineTaken:!day.creatineTaken});}
  function addProtein(amount:number){updateDay({...day,proteinServings:Math.max(0,(day.proteinServings||0)+amount)});}
  function addMeal(){
    if(!mealDraft.title.trim()) return;
    const meal:MealLog={id:nutritionUid(),date,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),type:mealDraft.type,title:mealDraft.title.trim(),notes:mealDraft.notes.trim(),quality:mealDraft.quality,proteinIncluded:mealDraft.proteinIncluded,fruitVegIncluded:mealDraft.fruitVegIncluded};
    updateDay({...day,meals:[meal,...day.meals],proteinServings:(day.proteinServings||0)+(meal.proteinIncluded?1:0)});
    setMealDraft({type:'Lunch',title:'',notes:'',quality:'Okay',proteinIncluded:true,fruitVegIncluded:false});
  }
  function deleteMeal(id:string){
    const meal=day.meals.find(m=>m.id===id);
    updateDay({...day,meals:day.meals.filter(m=>m.id!==id),proteinServings:Math.max(0,(day.proteinServings||0)-(meal?.proteinIncluded?1:0))});
  }

  const score=nutritionScoreV19(day);
  const habits=nutritionHabitsV20(day);
  const completedHabits=habits.filter(h=>h.done).length;
  const protein = day.proteinServings || 0;
  const proteinTarget = day.proteinTarget || 3;
  const qualityCounts={great:day.meals.filter(m=>m.quality==='Great').length, okay:day.meals.filter(m=>m.quality==='Okay').length, off:day.meals.filter(m=>m.quality==='Off-track').length};
  const weekStats=Array.from({length:7}).map((_,i)=>{const d=new Date(date); d.setDate(d.getDate()-(6-i)); const key=d.toISOString().slice(0,10); const entry=normaliseNutritionDay(logs[key]||emptyNutritionDay(key)); const points=(entry.waterMl>=1800?1:0)+(entry.creatineTaken?1:0)+(entry.meals.length>=3?1:0)+((entry.proteinServings||0)>=(entry.proteinTarget||3)?1:0); return {date:key,points,meals:entry.meals.length,waterMl:entry.waterMl};});
  const creatineStreak=(()=>{let streak=0; for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10); if(normaliseNutritionDay(logs[key]||emptyNutritionDay(key)).creatineTaken) streak++; else if(i>0) break;} return streak;})();
  const nextSuggestion=score>=90?'Strong day. Repeat the basics tomorrow.':day.waterMl<2000?'Drink 500 ml water next.':protein<proteinTarget?'Add one protein serving.':day.meals.length<3?'Log your next meal.':!(day.reflection||'').trim()?'Write a quick reflection.':'You are on track.';
  function exportBackup(){downloadNutritionJson(logs, `LiftLog_Nutrition_Backup_${nutritionToday()}.json`);}
  async function importBackup(file?:File){if(!file)return; const parsed=JSON.parse(await file.text()); setLogs(parsed); saveNutritionLogs(parsed);}

  return <section className="nutritionPage nutritionPro">
    <Card cls="hero nutritionHeroPro">
      <div className="nutritionHeroGrid">
        <div><div className="eyebrow lightText">NUTRITION ACCOUNTABILITY</div><h2>Fuel Dashboard</h2><p>Track water, creatine, caffeine, protein and meals without calorie obsession.</p></div>
        <div className="nutritionOrb"><span>{completedHabits}/5</span><em>Habits</em></div>
      </div>
    </Card>

    <Card cls="nutritionCommandCard"><div><span>Today's focus</span><strong>{nextSuggestion}</strong></div><input className="date-picker" type="date" value={date} onChange={e=>setDate(e.target.value)}/></Card>
    <Card cls="habitChecklistCard">
      <div className="sectionHeader">
        <div><h3>Daily Habits</h3><p className="muted">{score}% complete · starts from 0 each day</p></div>
      </div>
      <div className="habitChecklist">
        {habits.map(h=><div className={h.done?'habitPill done':'habitPill'} key={h.key}>
          <strong>{h.done?'✓':'○'} {h.label}</strong>
          <span>{h.detail}</span>
        </div>)}
      </div>
    </Card>

    <div className="nutritionProGrid">
      <Card cls="nutritionMetric hydration"><div className="metricIcon">💧</div><span>Hydration</span><strong>{day.waterMl} ml</strong><p>{Math.round(Math.min(100,(day.waterMl/2500)*100))}% of 2.5L target</p><div className="button-row"><button onClick={()=>addWater(250)}>+250</button><button onClick={()=>addWater(500)}>+500</button><button onClick={()=>addWater(-250)}>-250</button></div><div className="progress-track"><div style={{width:`${Math.min(100,(day.waterMl/2500)*100)}%`}} /></div></Card>
      <Card cls="nutritionMetric creatine"><div className="metricIcon">⚡</div><span>Creatine</span><strong>{day.creatineTaken?'Taken':'Pending'}</strong><p>{creatineStreak} day streak · {day.creatineGrams}g default</p><button className={day.creatineTaken?'done-button':'primary'} onClick={toggleCreatine}>{day.creatineTaken?'Creatine taken ✓':'Mark taken'}</button></Card>
      <Card cls="nutritionMetric caffeine"><div className="metricIcon">☕</div><span>Caffeine</span><strong>{day.caffeineMg} mg</strong><p>{day.caffeineLastAt?`Last logged ${day.caffeineLastAt}`:'Soft limit: 400 mg/day'}</p><div className="button-row"><button onClick={()=>addCaffeine(80)}>+80</button><button onClick={()=>addCaffeine(150)}>+150</button><button onClick={()=>addCaffeine(200)}>+200</button><button onClick={()=>addCaffeine(-80)}>-80</button></div>{day.caffeineMg>400&&<p className="warningText">High caffeine day. Consider stopping here.</p>}</Card>
      <Card cls="nutritionMetric protein"><div className="metricIcon">🥩</div><span>Protein servings</span><strong>{protein}/{proteinTarget}</strong><p>Simple serving target, not macro tracking.</p><div className="button-row"><button onClick={()=>addProtein(1)}>+1</button><button onClick={()=>addProtein(-1)}>-1</button><button onClick={()=>updateDay({...day,proteinTarget:proteinTarget+1})}>Target +</button><button onClick={()=>updateDay({...day,proteinTarget:Math.max(1,proteinTarget-1)})}>Target -</button></div></Card>
    </div>

    <Card cls="nutritionQuickAdd">
      <button onClick={()=>addWater(500)}>💧 +500 ml</button>
      <button onClick={toggleCreatine}>{day.creatineTaken?'⚡ Taken':'⚡ Creatine'}</button>
      <button onClick={()=>addProtein(1)}>🥩 Protein</button>
      <button onClick={()=>addCaffeine(80)}>☕ +80 mg</button>
    </Card>

    <Card cls="mealPanelPro">
      <div className="sectionHeader"><div><h3>Meal Accountability</h3><p className="muted">Log enough to stay honest, not enough to obsess.</p></div><div className="qualityPills"><span className="good">{qualityCounts.great} great</span><span>{qualityCounts.okay} okay</span><span className="bad">{qualityCounts.off} off-track</span></div></div>
      <div className="mealFormPro">
        <select value={mealDraft.type} onChange={e=>setMealDraft({...mealDraft,type:e.target.value as MealType})}><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option><option>Other</option></select>
        <input value={mealDraft.title} onChange={e=>setMealDraft({...mealDraft,title:e.target.value})} placeholder="What did you eat?"/>
        <select value={mealDraft.quality} onChange={e=>setMealDraft({...mealDraft,quality:e.target.value as MealQuality})}><option>Great</option><option>Okay</option><option>Off-track</option></select>
        <textarea value={mealDraft.notes} onChange={e=>setMealDraft({...mealDraft,notes:e.target.value})} placeholder="Quick note: portion, cravings, mood, eating out..."/>
        <label className="checkLine"><input type="checkbox" checked={mealDraft.proteinIncluded} onChange={e=>setMealDraft({...mealDraft,proteinIncluded:e.target.checked})}/> Protein included</label>
        <label className="checkLine"><input type="checkbox" checked={mealDraft.fruitVegIncluded} onChange={e=>setMealDraft({...mealDraft,fruitVegIncluded:e.target.checked})}/> Fruit/veg included</label>
        <button className="primary" onClick={addMeal}>Add Meal</button>
      </div>
      <div className="mealTimeline">{day.meals.length ? day.meals.map(meal=><div className={`mealItemPro ${meal.quality.toLowerCase().replace('-','')}`} key={meal.id}><div className="mealDot"/><div><span>{meal.type} · {meal.time}</span><h3>{meal.title}</h3>{meal.notes&&<p>{meal.notes}</p>}<div className="mealTags"><em>{meal.quality}</em>{meal.proteinIncluded&&<em>Protein</em>}{meal.fruitVegIncluded&&<em>Fruit/Veg</em>}</div></div><button onClick={()=>deleteMeal(meal.id)}>Delete</button></div>) : <p className="muted">No meals logged yet today.</p>}</div>
    </Card>

    <div className="nutritionReviewGrid">
      <Card><h3>Daily Reflection</h3><textarea value={day.reflection||''} onChange={e=>updateDay({...day,reflection:e.target.value})} placeholder="What went well? What made eating harder today? What is one better choice tomorrow?"/></Card>
      <Card><h3>Weekly Consistency</h3><div className="weekBarsNutrition pro">{weekStats.map(d=><div className="weekDayNutrition" key={d.date}><span>{new Date(d.date).toLocaleDateString([],{weekday:'short'})}</span><div className="miniBar"><div style={{height:`${Math.min(100,(d.points/4)*100)}%`}} /></div><small>{d.points}/4</small></div>)}</div></Card>
    </div>

    <Card cls="backupPanelNutrition"><button onClick={exportBackup}>Export Nutrition JSON</button><label className="secondary">Import Nutrition JSON<input hidden type="file" accept="application/json" onChange={e=>importBackup(e.target.files?.[0])}/></label></Card>
  </section>
}


function MorePage({data}:any){
  const {setPage, exercises, subtypes, routines}=data;
  const items = [
    {title:'Start Training', subtitle:'Open the streamlined workout flow', page:'log'},
    {title:'Training Studio', subtitle:'Build exercises, machines and routines', page:'routines'},
    {title:'Exercise Library', subtitle:`${exercises.length} exercises · ${exercises.filter((e:Exercise)=>e.favourite).length} favourites`, page:'exercises'},
    {title:'Machine Library', subtitle:`${subtypes.length} machine variants`, page:'subtypes'},
    {title:'Stats + Graphs', subtitle:'Progression charts and weekly volume', page:'stats'},
    {title:'Backups', subtitle:'Export, import and restore points', page:'backup'},
    {title:'Settings', subtitle:'Theme, unit and local data', page:'settings'}
  ];
  return <section>
    <Card cls="hero"><h2>More</h2><p>Keep setup tools here so the main app stays focused on training, nutrition and history.</p></Card>
    <div className="moreGrid">
      {items.map(item=><button key={item.title} className="moreItem" onClick={()=>setPage(item.page as Page)}>
        <strong>{item.title}</strong>
        <span>{item.subtitle}</span>
      </button>)}
    </div>
  </section>
}

function SettingsPage({data}:any){const {settings,refresh}=data; 
  async function exportData(){
    const payload={settings:await db.settings.toArray(),exercises:await db.exercises.toArray(),subtypes:await db.subtypes.toArray(),routines:await db.routines.toArray(),routineExercises:await db.routineExercises.toArray(),workouts:await db.workouts.toArray(),sets:await db.sets.toArray()}; 
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})); a.download='liftlog-v9-export.json'; a.click()
  } 
  async function importData(file: File | undefined){
    if(!file) return;
    if(!confirm('Importing will add records from the JSON backup into this browser. Continue?')) return;
    const text = await file.text();
    const payload = JSON.parse(text);
    if(payload.exercises) await db.exercises.bulkAdd(payload.exercises.map((x:any)=>({...x,id:undefined})));
    if(payload.subtypes) await db.subtypes.bulkAdd(payload.subtypes.map((x:any)=>({...x,id:undefined})));
    if(payload.routines) await db.routines.bulkAdd(payload.routines.map((x:any)=>({...x,id:undefined})));
    if(payload.routineExercises) await db.routineExercises.bulkAdd(payload.routineExercises.map((x:any)=>({...x,id:undefined})));
    if(payload.workouts) await db.workouts.bulkAdd(payload.workouts.map((x:any)=>({...x,id:undefined})));
    if(payload.sets) await db.sets.bulkAdd(payload.sets.map((x:any)=>({...x,id:undefined})));
    refresh();
    alert('Import complete. Some links may need review if imported across different versions.');
  }
  async function clear(){if(!confirm('Delete all local LiftLog data? Export first if you want a backup.'))return; await db.delete(); location.reload()} 
  return <section>
    <Card><h3>Default display unit</h3><select value={settings.unit} onChange={async e=>{await db.settings.put({...settings,unit:e.target.value as Unit});refresh()}}><option value="kg">kg</option><option value="lb">lb</option></select><p className="muted">Machine subtypes still keep their own default units.</p></Card>
    <Card><h3>Theme</h3><button className="secondary" onClick={async()=>{await db.settings.put({...settings,theme:settings.theme==='light'?'dark':'light'});refresh()}}>{settings.theme==='light'?<Moon/>:<Sun/>} Toggle theme</button></Card>
    <Card><h3>Local backup</h3><button className="secondary" onClick={exportData}>Export JSON Backup</button><label className="upload">Import JSON Backup<input hidden type="file" accept="application/json" onChange={e=>importData(e.target.files?.[0])}/></label><button className="danger" onClick={clear}>Delete all local data</button></Card>
  </section>
}


async function buildLocalBackupPayload() {
  return {
    app: 'LiftLog',
    version: 11,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    exercises: await db.exercises.toArray(),
    subtypes: await db.subtypes.toArray(),
    routines: await db.routines.toArray(),
    routineExercises: await db.routineExercises.toArray(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray()
  };
}

async function createBackupSnapshot(reason = 'Manual backup') {
  const payload = await buildLocalBackupPayload();
  const stamp = new Date().toLocaleString();
  await db.backups.add({
    name: `LiftLog backup - ${stamp}`,
    reason,
    createdAt: new Date().toISOString(),
    payload
  });

  const all = await db.backups.orderBy('createdAt').toArray();
  const excess = all.length - 20;
  if (excess > 0) {
    for (const old of all.slice(0, excess)) {
      if (old.id) await db.backups.delete(old.id);
    }
  }
}

async function restoreFromPayload(payload:any) {
  if (!payload) throw new Error('No backup payload found.');
  await db.settings.clear();
  await db.exercises.clear();
  await db.subtypes.clear();
  await db.routines.clear();
  await db.routineExercises.clear();
  await db.workouts.clear();
  await db.sets.clear();
  if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
  else await db.settings.put({id:'settings', unit:'kg', theme:'light'});
  if (payload.exercises?.length) await db.exercises.bulkPut(payload.exercises);
  if (payload.subtypes?.length) await db.subtypes.bulkPut(payload.subtypes);
  if (payload.routines?.length) await db.routines.bulkPut(payload.routines);
  if (payload.routineExercises?.length) await db.routineExercises.bulkPut(payload.routineExercises);
  if (payload.workouts?.length) await db.workouts.bulkPut(payload.workouts);
  if (payload.sets?.length) await db.sets.bulkPut(payload.sets);
}

function downloadJson(payload:any, filename:string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}));
  a.download = filename;
  a.click();
}

function backupFilename() {
  const d = new Date();
  const pad = (n:number) => String(n).padStart(2, '0');
  return `LiftLog_Backup_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`;
}

function BackupPage({data}:any){
  const {refresh}=data;
  const [backups,setBackups]=useState<BackupSnapshot[]>([]);
  const [status,setStatus]=useState('');

  async function loadBackups(){
    setBackups(await db.backups.orderBy('createdAt').reverse().toArray());
  }

  useEffect(()=>{loadBackups();},[]);

  async function exportBackup(){
    const payload = await buildLocalBackupPayload();
    downloadJson(payload, backupFilename());
    await createBackupSnapshot('Exported JSON backup');
    await loadBackups();
    setStatus('Backup exported and local restore point created.');
  }

  async function manualSnapshot(){
    await createBackupSnapshot('Manual restore point');
    await loadBackups();
    setStatus('Manual restore point created.');
  }

  async function importBackup(file: File | undefined){
    if(!file) return;
    if(!confirm('Import this JSON backup? This will replace the current local LiftLog data on this device.')) return;
    try{
      await createBackupSnapshot('Before JSON import');
      const text = await file.text();
      const payload = JSON.parse(text);
      await restoreFromPayload(payload);
      refresh();
      await loadBackups();
      setStatus('Import complete. Current device now uses the imported backup.');
    }catch(err:any){
      setStatus('Import failed: ' + (err.message || String(err)));
    }
  }

  async function restoreSnapshot(snapshot: BackupSnapshot){
    if(!confirm(`Restore "${snapshot.name}"? This replaces current local data on this device.`)) return;
    try{
      await createBackupSnapshot('Before restoring snapshot');
      await restoreFromPayload(snapshot.payload);
      refresh();
      await loadBackups();
      setStatus('Restore complete.');
    }catch(err:any){
      setStatus('Restore failed: ' + (err.message || String(err)));
    }
  }

  async function deleteSnapshot(snapshot: BackupSnapshot){
    if(!snapshot.id) return;
    if(!confirm('Delete this restore point?')) return;
    await db.backups.delete(snapshot.id);
    await loadBackups();
  }

  return <section>
    <Card cls="hero"><h2>Local Backups</h2><p>Export JSON files, import backups, and keep the last 20 in-browser restore points. No Supabase required.</p></Card>

    <Card>
      <h3>Backup actions</h3>
      <button className="primary" onClick={exportBackup}>Export JSON Backup</button>
      <label className="upload">Import JSON Backup<input hidden type="file" accept="application/json" onChange={e=>importBackup(e.target.files?.[0])}/></label>
      <button className="secondary" onClick={manualSnapshot}>Create restore point</button>
      <p className="muted">Tip: save exported JSON files to iCloud Drive, Google Drive, OneDrive or email them to yourself.</p>
      {status && <div className="backupStatus">{status}</div>}
    </Card>

    <Card>
      <h3>Local restore points</h3>
      <p className="muted">LiftLog keeps up to 20 restore points in this browser. These do not transfer to other devices unless exported as JSON.</p>
      {backups.length ? backups.map(b=><div className="backupRow" key={b.id}>
        <div>
          <strong>{b.name}</strong>
          <span>{b.reason} · {new Date(b.createdAt).toLocaleString()}</span>
        </div>
        <div className="backupActions">
          <button className="smallAction" onClick={()=>downloadJson(b.payload, backupFilename())}>Download</button>
          <button className="smallAction" onClick={()=>restoreSnapshot(b)}>Restore</button>
          <button className="trash tinyTrash" onClick={()=>deleteSnapshot(b)}><Trash2/></button>
        </div>
      </div>) : <p className="muted">No restore points yet.</p>}
    </Card>

    <Card>
      <h3>Simple device transfer</h3>
      <ol className="steps">
        <li>On your main device, press <strong>Export JSON Backup</strong>.</li>
        <li>Send the file to your other device using AirDrop, iCloud Drive, email, Google Drive or OneDrive.</li>
        <li>On the other device, press <strong>Import JSON Backup</strong>.</li>
      </ol>
    </Card>
  </section>
}


function HistoryPage({data}:any){
  const {exercises,routines,workouts,sets,replacements}=data;
  const [selectedId,setSelectedId]=useState<number|undefined>();
  const nutritionLogs:Record<string,DailyNutritionLog> = loadNutritionLogs();
  const completed = workouts.filter((w:Workout)=>w.endedAt).sort((a:Workout,b:Workout)=>b.startedAt.localeCompare(a.startedAt));
  const selected = completed.find((w:Workout)=>w.id===selectedId);

  if(selected){
    const ss = workoutSetsFor(selected, sets);
    const grouped = exercises.map((ex:Exercise)=>({ex, rows:ss.filter((s:WorkoutSet)=>s.exerciseId===ex.id)})).filter((x:any)=>x.rows.length);
    return <section>
      <Card cls="premiumCard"><button className="secondary mini" onClick={()=>setSelectedId(undefined)}>← Back to history</button><h2>{selected.title}</h2><p className="muted">{selected.date} · {durationMinutes(selected)} min · {ss.length} sets · {fmtVol(workoutVolume(selected,sets))}</p></Card>
      {grouped.map((g:any)=><Card key={g.ex.id} cls="historyExercise">
        <h3>{g.ex.name}</h3>{replacements?.some((r:WorkoutReplacement)=>r.workoutId===selected.id&&r.replacementExerciseId===g.ex.id)&&<p className="muted">Used as a replacement in this workout.</p>}
        {g.rows.sort((a:WorkoutSet,b:WorkoutSet)=>a.setNumber-b.setNumber).map((s:WorkoutSet)=><div className="historySet" key={s.id}><span>Set {s.setNumber}</span><strong>{s.weight}{s.unit} × {s.reps}</strong><em>{fmtVol(volumeKg(s))}</em></div>)}
      </Card>)}
    </section>
  }

  const dayKeys = Array.from(new Set([...completed.map((w:Workout)=>w.date), ...Object.keys(nutritionLogs)])).sort((a,b)=>b.localeCompare(a)).slice(0,30);
  const totalVol7 = completed.filter((w:Workout)=>new Date(w.date)>=new Date(Date.now()-7*86400000)).reduce((a,w)=>a+workoutVolume(w,sets),0);
  const nutritionDays7 = Object.keys(nutritionLogs).filter(d=>new Date(d)>=new Date(Date.now()-7*86400000)).length;
  const meals7 = Object.entries(nutritionLogs).filter(([d])=>new Date(d)>=new Date(Date.now()-7*86400000)).reduce((a,[,n])=>a+(n.meals?.length||0),0);

  return <section>
    <Card cls="hero heroV12"><h2>History</h2><p>Training and nutrition history in one place.</p></Card>
    <div className="historySummaryGrid">
      <Card><span className="eyebrow">7-day volume</span><h3>{fmtVol(totalVol7)}</h3></Card>
      <Card><span className="eyebrow">Workouts</span><h3>{completed.filter((w:Workout)=>new Date(w.date)>=new Date(Date.now()-7*86400000)).length}</h3></Card>
      <Card><span className="eyebrow">Nutrition days</span><h3>{nutritionDays7}</h3></Card>
      <Card><span className="eyebrow">Meals logged</span><h3>{meals7}</h3></Card>
    </div>
    {dayKeys.length ? dayKeys.map(day=>{
      const dayWorkouts=completed.filter((w:Workout)=>w.date===day);
      const n=nutritionLogs[day] ? normaliseNutritionDay(nutritionLogs[day]) : undefined;
      return <Card key={day} cls="combinedDayCard">
        <h3>{new Date(day).toLocaleDateString([], {weekday:'long', day:'numeric', month:'short'})}</h3>
        {dayWorkouts.map((w:Workout)=>{ const routine=routines.find((r:Routine)=>r.id===w.routineId); const ss=workoutSetsFor(w,sets); return <button className="combinedWorkoutRow detailed" key={w.id} onClick={()=>setSelectedId(w.id)}><span style={{background:routine?.color||'#2563eb'}}/><strong>{w.title}</strong><em>{ss.length} sets · {fmtVol(workoutVolume(w,sets))} · {durationMinutes(w)} min · Top: {ss.length?exercises.find((e:Exercise)=>e.id===ss[0].exerciseId)?.name:'—'}</em></button> })}
        {n ? <div className="combinedNutritionRow"><strong>Nutrition · {nutritionScoreV19(n)}%</strong><span>Water {n.waterMl}ml · Meals {n.meals.length} · Protein {(n.proteinServings??0)}/{n.proteinTarget??3} · Caffeine {n.caffeineMg}mg · {n.creatineTaken?'Creatine ✓':'Creatine ○'}</span>{n.reflection&&<em>{n.reflection.slice(0,90)}</em>}</div> : <p className="muted">No nutrition logged.</p>}
      </Card>
    }) : <Card><p className="muted">No history yet.</p></Card>}
  </section>
}

