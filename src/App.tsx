
import { useEffect, useMemo, useState } from 'react';
import Dexie, { Table } from 'dexie';
import { Activity, BarChart3, CalendarDays, Check, Dumbbell, Home, ImagePlus, ListChecks, Moon, Play, Plus, Settings, Sun, Trash2 } from 'lucide-react';

type Unit = 'kg' | 'lb';
type Theme = 'light' | 'dark';
type Page = 'home' | 'exercises' | 'exerciseDetail' | 'subtypes' | 'routines' | 'log' | 'calendar' | 'history' | 'progress' | 'stats' | 'backup' | 'settings' | 'more';
type SettingType = 'dropdown' | 'checkbox' | 'text';

type AppSettings = { id: 'settings'; unit: Unit; theme: Theme };
type BackupSnapshot = { id?: number; name: string; reason: string; createdAt: string; payload: any };
type Exercise = { id?: number; name: string; muscle: string; equipment: string; notes?: string; createdAt: string };
type MachineSetting = { id: string; label: string; type: SettingType; options?: string[]; defaultValue?: string | boolean };
type Subtype = { id?: number; exerciseId: number; name: string; defaultUnit: Unit; photo?: Blob; settings: MachineSetting[]; createdAt: string };
type Routine = { id?: number; name: string; color: string; archived?: boolean; createdAt: string };
type RoutineExercise = { id?: number; routineId: number; exerciseId: number; subtypeId?: number; order: number; sets: number; reps: string; rest: number; createdAt: string };
type Workout = { id?: number; routineId?: number; title: string; date: string; startedAt: string; endedAt?: string };
type PlannedWorkout = { id?: number; routineId: number; date: string; note?: string; createdAt: string };
type WorkoutSet = { id?: number; workoutId: number; exerciseId: number; subtypeId?: number; setNumber: number; weight: number; reps: number; unit: Unit; rir?: number; completed: boolean; settingValues?: Record<string, string | boolean>; createdAt: string };

class LiftDB extends Dexie {
  settings!: Table<AppSettings, string>;
  exercises!: Table<Exercise, number>;
  subtypes!: Table<Subtype, number>;
  routines!: Table<Routine, number>;
  routineExercises!: Table<RoutineExercise, number>;
  workouts!: Table<Workout, number>;
  sets!: Table<WorkoutSet, number>;
  plannedWorkouts!: Table<PlannedWorkout, number>;
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

async function seed() {
  if (!await db.settings.get('settings')) await db.settings.put({ id:'settings', unit:'kg', theme:'light' });
  if (await db.exercises.count()) return;
  const t = now();
  const ids = await db.exercises.bulkAdd([
    {name:'Incline Chest Press', muscle:'Chest', equipment:'Machine', createdAt:t},
    {name:'Lateral Raise', muscle:'Side Delt', equipment:'Machine', createdAt:t},
    {name:'Pec Fly', muscle:'Chest', equipment:'Cable', createdAt:t},
    {name:'Shoulder Press', muscle:'Front Delt', equipment:'Machine', createdAt:t},
    {name:'Rear Delt Fly', muscle:'Rear Delt', equipment:'Machine', createdAt:t},
  ], {allKeys:true}) as number[];
  await db.subtypes.bulkAdd([
    {exerciseId:ids[1], name:'Technogym Lateral Raise', defaultUnit:'kg', settings:[
      {id:'seat',label:'Seat Position',type:'dropdown',options:['1','2','3','4','5'],defaultValue:'3'},
      {id:'neutral',label:'Neutral Grip',type:'checkbox',defaultValue:true}
    ], createdAt:t},
    {exerciseId:ids[1], name:'Prime Lateral Raise', defaultUnit:'lb', settings:[
      {id:'seat',label:'Seat Position',type:'dropdown',options:['1','2','3','4','5'],defaultValue:'2'},
      {id:'top',label:'Top Resistance',type:'dropdown',options:['1','2','3','4','5'],defaultValue:'3'}
    ], createdAt:t}
  ]);
  const r = await db.routines.add({name:'Upper Push / Shoulders', color:'#7c3aed', createdAt:t});
  await db.routineExercises.bulkAdd([
    {routineId:r, exerciseId:ids[0], order:1, sets:4, reps:'8-12', rest:90, createdAt:t},
    {routineId:r, exerciseId:ids[1], subtypeId:1, order:2, sets:4, reps:'10-15', rest:90, createdAt:t},
    {routineId:r, exerciseId:ids[2], order:3, sets:4, reps:'10-15', rest:90, createdAt:t},
    {routineId:r, exerciseId:ids[3], order:4, sets:4, reps:'8-12', rest:120, createdAt:t},
    {routineId:r, exerciseId:ids[4], order:5, sets:4, reps:'10-15', rest:90, createdAt:t},
  ]);
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
      {page==='exercises' && <ExercisesPage data={{exercises,subtypes,sets,workouts,refresh,setPage,setSelectedExerciseId}} />}
      {page==='exerciseDetail' && <ExerciseDetailPage data={{selectedExerciseId,exercises,subtypes,workouts,sets,setPage}} />}
      {page==='subtypes' && <SubtypesPage data={{exercises,subtypes,refresh}} />}
      {page==='routines' && <RoutinesPage data={{exercises,subtypes,routines,routineExercises,refresh}} />}
      {page==='log' && <LogPage data={{settings,exercises,subtypes,routines,routineExercises,workouts,sets,activeWorkout,setActiveWorkoutId,refresh}} />}
      {page==='calendar' && <CalendarPage data={{routines,workouts,sets,plannedWorkouts,refresh,setPage}} />}
      {page==='history' && <HistoryPage data={{exercises,subtypes,routines,workouts,sets}} />}
      {page==='progress' && <ProgressPage data={{settings,exercises,subtypes,workouts,sets}} />}
      {page==='more' && <MorePage data={{setPage,exercises,subtypes,routines}} />}
      {page==='stats' && <StatsPage data={{settings,exercises,workouts,sets}} />}
      {page==='backup' && <BackupPage data={{refresh}} />}
      {page==='settings' && <SettingsPage data={{settings,refresh}} />}
    </main>
    <nav className="tabs fiveTabs premiumTabs">
      <Tab p="home" page={page} setPage={setPage} icon={<Home/>} label="Home"/>
      <Tab p="log" page={page} setPage={setPage} icon={<Play/>} label="Workout"/>
      <Tab p="calendar" page={page} setPage={setPage} icon={<CalendarDays/>} label="Calendar"/>
      <Tab p="history" page={page} setPage={setPage} icon={<ListChecks/>} label="History"/>
      <Tab p="more" page={page} setPage={setPage} icon={<Settings/>} label="More"/>
    </nav>
  </div>
}
function title(p:Page){return {home:'Dashboard',exercises:'Exercises',subtypes:'Subtypes',routines:'Routines',log:'Workout',calendar:'Calendar',history:'History',stats:'Stats',settings:'Settings',exerciseDetail:'Exercise Detail',progress:'Progress',backup:'Backup',more:'More'}[p]}
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
    addWeightedMuscle(values, ex.muscle, volumeKg(s));
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
function addWeightedMuscle(values:Record<string,number>, muscle:string, amount:number) {
  const primary = muscleKeyFromName(muscle);
  if(primary in values) values[primary] += amount;
  Object.entries(secondaryWeights[muscle] || {}).forEach(([key,weight])=>{ if(key in values) values[key] += amount * weight; });
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

function ExercisesPage({data}:any){
  const {exercises,subtypes,sets,workouts,refresh,setPage,setSelectedExerciseId}=data;
  const [name,setName]=useState(''); const [muscle,setMuscle]=useState('Side Delt'); const [equip,setEquip]=useState('Machine');
  const [editingId,setEditingId]=useState<number|undefined>(); const [editName,setEditName]=useState(''); const [editMuscle,setEditMuscle]=useState('Side Delt'); const [editEquip,setEditEquip]=useState('Machine');

  async function add(){ if(!name.trim()) return alert('Exercise name required'); await db.exercises.add({name:name.trim(),muscle,equipment:equip,createdAt:now()}); setName(''); refresh(); }
  async function del(ex:Exercise){ if(!confirm('Delete this exercise, its subtypes, and remove it from routines? Past set history remains.')) return; await db.exercises.delete(ex.id!); const ss=await db.subtypes.where('exerciseId').equals(ex.id!).toArray(); for(const s of ss) await db.subtypes.delete(s.id!); const rs=await db.routineExercises.where('exerciseId').equals(ex.id!).toArray(); for(const r of rs) await db.routineExercises.delete(r.id!); refresh(); }
  function beginEdit(ex:Exercise){ setEditingId(ex.id); setEditName(ex.name); setEditMuscle(ex.muscle); setEditEquip(ex.equipment); }
  async function saveEdit(){ if(!editingId) return; await db.exercises.update(editingId,{name:editName,muscle:editMuscle,equipment:editEquip}); setEditingId(undefined); refresh(); }

  return <section><Card><h3>Add Exercise</h3><input placeholder="Exercise name" value={name} onChange={e=>setName(e.target.value)}/><select value={muscle} onChange={e=>setMuscle(e.target.value)}>{muscles.map(m=><option key={m}>{m}</option>)}</select><select value={equip} onChange={e=>setEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select><button className="primary" onClick={add}><Plus/>Save Exercise</button></Card>
  {exercises.map((ex:Exercise)=>{ const prs=allTimePRsForExercise(ex.id, sets); return <Card key={ex.id}>
    {editingId===ex.id ? <div>
      <input value={editName} onChange={e=>setEditName(e.target.value)}/>
      <select value={editMuscle} onChange={e=>setEditMuscle(e.target.value)}>{muscles.map(m=><option key={m}>{m}</option>)}</select>
      <select value={editEquip} onChange={e=>setEditEquip(e.target.value)}>{equipment.map(e=><option key={e}>{e}</option>)}</select>
      <div className="grid2"><button className="primary" onClick={saveEdit}>Save edit</button><button className="secondary" onClick={()=>setEditingId(undefined)}>Cancel</button></div>
    </div> : <div>
      <div className="row">
        <div onClick={()=>{setSelectedExerciseId(ex.id); setPage('exerciseDetail')}} className="tapArea">
          <h3>{ex.name}</h3>
          <Pills><span>{ex.muscle}</span><span>{ex.equipment}</span><span>{subtypes.filter((s:Subtype)=>s.exerciseId===ex.id).length} subtypes</span>{prs&&<span>{prs.setCount} sets logged</span>}</Pills>
        </div>
        <div className="iconStack"><button className="smallAction" onClick={()=>beginEdit(ex)}>Edit</button><button className="trash" onClick={()=>del(ex)}><Trash2/></button></div>
      </div>
      {prs && <div className="quickPRs"><span>Heaviest {Math.round(kgValue(prs.heaviest)*10)/10}kg</span><span>Best e1RM {e1rm(kgValue(prs.bestE1RM), prs.bestE1RM.reps)}kg</span></div>}
    </div>}
  </Card>})}</section>
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
  function addSetting(){ if(!label.trim())return; setSettings([...settings,{id:crypto.randomUUID(),label:label.trim(),type,options:type==='dropdown'?opts.split(',').map(x=>x.trim()):undefined,defaultValue:type==='checkbox'?false:''}]); setLabel(''); }
  async function add(){ if(!exerciseId||!name.trim()) return alert('Choose exercise and name'); await db.subtypes.add({exerciseId,name:name.trim(),defaultUnit:unit,photo,settings,createdAt:now()}); setName(''); setPhoto(undefined); setSettings([]); setUnit('kg'); refresh(); }
  async function del(s:Subtype){ if(!confirm('Delete this subtype? Past set logs remain.'))return; await db.subtypes.delete(s.id!); const rs=await db.routineExercises.where('subtypeId').equals(s.id!).toArray(); for(const r of rs) await db.routineExercises.update(r.id!,{subtypeId:undefined}); refresh(); }
  return <section><Card><h3>Add Machine Subtype</h3><select value={exerciseId??''} onChange={e=>setExerciseId(Number(e.target.value))}><option value="">Choose exercise</option>{exercises.map((e:Exercise)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input placeholder="e.g. Prime Lateral Raise" value={name} onChange={e=>setName(e.target.value)}/><label>Default unit for this exact machine</label><select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select><label className="upload"><ImagePlus/> Add one machine photo<input hidden type="file" accept="image/*" capture="environment" onChange={e=>setPhoto(e.target.files?.[0])}/></label>{photo&&<img className="preview" src={blobUrl(photo)}/>}<h4>Machine settings</h4><input placeholder="Setting label e.g. Seat Position" value={label} onChange={e=>setLabel(e.target.value)}/><select value={type} onChange={e=>setType(e.target.value as SettingType)}><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="text">Text</option></select>{type==='dropdown'&&<input value={opts} onChange={e=>setOpts(e.target.value)} placeholder="1,2,3,4,5"/>}<button className="secondary" onClick={addSetting}>Add Setting</button><Pills>{settings.map(s=><span key={s.id}>{s.label} · {s.type}</span>)}</Pills><button className="primary" onClick={add}>Save Subtype</button></Card>
  {subtypes.map((s:Subtype)=>{const ex=exercises.find((e:Exercise)=>e.id===s.exerciseId);return <Card key={s.id} cls="machine"><div>{s.photo?<img src={blobUrl(s.photo)}/>:<div className="placeholder">No photo</div>}</div><div><div className="row"><h3>{s.name}</h3><button className="trash" onClick={()=>del(s)}><Trash2/></button></div><p className="muted">{ex?.name}</p><Pills><span>{s.defaultUnit}</span>{s.settings.map(x=><span key={x.id}>{x.label}</span>)}</Pills></div></Card>})}</section>
}

function RoutinesPage({data}:any){
  const {exercises,subtypes,routines,routineExercises,refresh}=data;
  const [routineName,setRoutineName]=useState(''); const [colour,setColour]=useState('#7c3aed'); const [routineId,setRoutineId]=useState<number|undefined>(routines[0]?.id);
  const [exerciseId,setExerciseId]=useState<number|undefined>(); const [subtypeId,setSubtypeId]=useState<number|undefined>(); const [setsN,setSetsN]=useState(4); const [reps,setReps]=useState('8-12'); const [rest,setRest]=useState(90);
  async function create(){ if(!routineName.trim())return; const id=await db.routines.add({name:routineName.trim(),color:colour,createdAt:now()}); setRoutineId(id); setRoutineName(''); refresh(); }
  async function add(){ if(!routineId||!exerciseId)return alert('Choose routine and exercise'); const current=routineExercises.filter((r:RoutineExercise)=>r.routineId===routineId); await db.routineExercises.add({routineId,exerciseId,subtypeId,order:current.length+1,sets:setsN,reps,rest,createdAt:now()}); refresh(); }
  async function delRoutine(){ if(!routineId||!confirm('Delete this routine template? Workout history remains.'))return; const items=await db.routineExercises.where('routineId').equals(routineId).toArray(); for(const i of items) await db.routineExercises.delete(i.id!); await db.routines.delete(routineId); setRoutineId(undefined); refresh(); }
  const items=routineExercises.filter((r:RoutineExercise)=>r.routineId===routineId).sort((a: RoutineExercise, b: RoutineExercise)=>a.order-b.order);
  return <section><Card><h3>Create Routine</h3><input placeholder="Routine name" value={routineName} onChange={e=>setRoutineName(e.target.value)}/><div className="colourRow">{colours.map(c=><button key={c} className={colour===c?'colour activeColour':'colour'} style={{background:c}} onClick={()=>setColour(c)}/>)}</div><button className="primary" onClick={create}>Create Routine</button></Card>
  <Card><h3>Edit Routine</h3><select value={routineId??''} onChange={e=>setRoutineId(Number(e.target.value))}><option value="">Choose routine</option>{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}</select>{routineId&&<><div className="colourRow">{colours.map(c=><button key={c} className={(routines.find((r:Routine)=>r.id===routineId)?.color||'')===c?'colour activeColour':'colour'} style={{background:c}} onClick={async()=>{await db.routines.update(routineId,{color:c}); refresh();}}/>)}</div><div className="grid3">
        <button className="secondary mini" onClick={async()=>{ 
          const r = routines.find((x:Routine)=>x.id===routineId);
          if(!r || !routineId) return;
          const newId = await db.routines.add({name:r.name + ' Copy', color:r.color, archived:false, createdAt:now()});
          const items = routineExercises.filter((x:RoutineExercise)=>x.routineId===routineId).sort((a: RoutineExercise, b: RoutineExercise)=>a.order-b.order);
          for (const item of items) await db.routineExercises.add({...item, id:undefined, routineId:newId, createdAt:now()});
          setRoutineId(newId);
          refresh();
        }}>Duplicate</button>
        <button className="secondary mini" onClick={async()=>{ if(routineId){ await db.routines.update(routineId,{archived:true}); refresh(); }}}>Archive</button>
        <button className="danger mini" onClick={delRoutine}>Delete</button>
      </div></>}<select value={exerciseId??''} onChange={e=>{setExerciseId(Number(e.target.value));setSubtypeId(undefined)}}><option value="">Choose exercise</option>{exercises.map((e:Exercise)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={subtypeId??''} onChange={e=>setSubtypeId(e.target.value?Number(e.target.value):undefined)}><option value="">Optional subtype</option>{subtypes.filter((s:Subtype)=>!exerciseId||s.exerciseId===exerciseId).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}</select><div className="grid3"><label>Sets<input type="number" value={setsN} onChange={e=>setSetsN(Number(e.target.value))}/></label><label>Reps<input value={reps} onChange={e=>setReps(e.target.value)}/></label><label>Rest<input type="number" value={rest} onChange={e=>setRest(Number(e.target.value))}/></label></div><button className="primary" onClick={add}>Add to Routine</button></Card>
  {items.map((it:RoutineExercise)=>{const ex=exercises.find((e:Exercise)=>e.id===it.exerciseId); const st=subtypes.find((s:Subtype)=>s.id===it.subtypeId); return <Card key={it.id} cls="machine">{st?.photo?<img src={blobUrl(st.photo)}/>:<div className="placeholder">{it.order}</div>}<div><div className="row"><h3>{it.order}. {ex?.name}</h3><div className="iconStack">
          <button className="smallAction" onClick={async()=>{ await db.routineExercises.update(it.id!,{order:Math.max(1,it.order-1)}); refresh();}}>↑</button>
          <button className="smallAction" onClick={async()=>{ await db.routineExercises.update(it.id!,{order:it.order+1}); refresh();}}>↓</button>
          <button className="trash" onClick={async()=>{await db.routineExercises.delete(it.id!);refresh();}}><Trash2/></button>
        </div></div><p className="muted">{st?.name||'No subtype selected'}</p><Pills><span>{it.sets} sets</span><span>{it.reps}</span><span>{it.rest}s</span></Pills></div></Card>})}</section>
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

function LogPage({data}:any){
  const {settings,exercises,subtypes,routines,routineExercises,workouts,sets,activeWorkout,setActiveWorkoutId,refresh}=data;
  const [routineId,setRoutineId]=useState<number|undefined>(); 
  const [timer,setTimer]=useState<number|undefined>(); 
  const [rest,setRest]=useState(90); 
  const [,setTick]=useState(0);
  const [customMode,setCustomMode]=useState(false);
  const [customItems,setCustomItems]=useState<RoutineExercise[]>([]);
  const [addExerciseId,setAddExerciseId]=useState<number|undefined>();
  const [addSubtypeId,setAddSubtypeId]=useState<number|undefined>();

  useEffect(()=>{const i=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(i)},[]);
  useEffect(()=>{ let lock:any; async function requestLock(){ try{ if('wakeLock' in navigator && activeWorkout){ lock = await (navigator as any).wakeLock.request('screen'); } }catch{} } requestLock(); return ()=>{ try{lock?.release?.()}catch{} }; },[activeWorkout?.id]);

  async function start(){ if(!routineId)return alert('Choose routine'); const r=routines.find((x:Routine)=>x.id===routineId); const id=await db.workouts.add({routineId,title:r?.name||'Workout',date:today(),startedAt:now()}); setActiveWorkoutId(id); refresh(); }
  async function startEmpty(){ const id=await db.workouts.add({title:'Custom Workout',date:today(),startedAt:now()}); setCustomMode(true); setActiveWorkoutId(id); refresh(); }
  async function finish(){ 
    if(!activeWorkout?.id)return; 
    await db.workouts.update(activeWorkout.id,{endedAt:now()}); 
    if(customMode && customItems.length && confirm('Save this custom workout as a new routine?')){
      const name = prompt('Routine name?', 'Custom Routine') || 'Custom Routine';
      const rid = await db.routines.add({name, color:'#2563eb', archived:false, createdAt:now()});
      for (const item of customItems) await db.routineExercises.add({...item, id:undefined, routineId:rid, createdAt:now()});
    }
    setActiveWorkoutId(undefined); setCustomItems([]); setCustomMode(false); refresh(); 
  }
  function addCustomExercise(){
    if(!addExerciseId) return alert('Choose exercise');
    const item:RoutineExercise = {id:Date.now(), routineId:0, exerciseId:addExerciseId, subtypeId:addSubtypeId, order:customItems.length+1, sets:3, reps:'8-12', rest:90, createdAt:now()};
    setCustomItems([...customItems,item]);
    setAddExerciseId(undefined); setAddSubtypeId(undefined);
  }
  if(!activeWorkout) return <section>
    <Card><h3>Start Workout</h3><select value={routineId??''} onChange={e=>setRoutineId(Number(e.target.value))}><option value="">Choose routine</option>{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}</select><button className="primary" onClick={start}>Start Routine</button><button className="secondary" onClick={startEmpty}>Start Empty Workout</button></Card>
    <Card><h3>Timeout protection</h3><p className="muted">Sets save immediately. If the page refreshes, LiftLog will try to resume your unfinished workout. During workouts, screen wake lock is requested where your browser supports it.</p></Card>
  </section>;
  const routineItems=routineExercises.filter((r:RoutineExercise)=>r.routineId===activeWorkout.routineId).sort((a:RoutineExercise,b:RoutineExercise)=>a.order-b.order);
  const items=customMode || !activeWorkout.routineId ? customItems : routineItems;
  const left = timer ? Math.max(0, rest - Math.floor((Date.now()-timer)/1000)) : rest;

  return <section className="workoutV15">
    <Card cls="workoutHeaderSticky"><div className="row"><div><h3>{activeWorkout.title}</h3><p className="muted">Started {new Date(activeWorkout.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><button className="finishBtn" onClick={finish}>Finish</button></div></Card>
    <div className="floatingTimer smartTimer"><strong>{left}s</strong><button onClick={()=>setTimer(Date.now())}>Reset</button><button onClick={()=>setTimer((timer||Date.now())-15000)}>+15</button></div>
    <Card cls="addExercisePanel"><h3>Add exercise during workout</h3><ExerciseSearchSelect exercises={exercises} value={addExerciseId} onChange={(id)=>{setAddExerciseId(id);setAddSubtypeId(undefined)}} placeholder="Search exercise to add..." /><select value={addSubtypeId??''} onChange={e=>setAddSubtypeId(e.target.value?Number(e.target.value):undefined)}><option value="">Optional subtype</option>{subtypes.filter((s:Subtype)=>!addExerciseId||s.exerciseId===addExerciseId).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="secondary" onClick={addCustomExercise}>+ Add Exercise</button></Card>
    {items.map((it:RoutineExercise)=>{ const ex=exercises.find((e:Exercise)=>e.id===it.exerciseId); if(!ex) return null; return <Logger key={it.id} item={it} ex={ex} subtypes={subtypes.filter((s:Subtype)=>s.exerciseId===ex?.id)} initialSubtype={subtypes.find((s:Subtype)=>s.id===it.subtypeId)} workout={activeWorkout} workouts={workouts} sets={sets} defaultUnit={settings.unit} refresh={refresh} onSave={()=>setTimer(Date.now())}/> })}
  </section>
}
function previousSets(exerciseId:number, subtypeId:number|undefined, workout:Workout, workouts:Workout[], sets:WorkoutSet[]){
  const past=workouts.filter(w=>w.id!==workout.id&&w.date<workout.date).sort((a: Workout, b: Workout)=>b.date.localeCompare(a.date));
  for(const w of past){const found=sets.filter(s=>s.workoutId===w.id&&s.exerciseId===exerciseId&&(subtypeId?s.subtypeId===subtypeId:true)).sort((a: WorkoutSet, b: WorkoutSet)=>a.setNumber-b.setNumber); if(found.length)return found}
  return [];
}
function Logger({item,ex,subtypes,initialSubtype,workout,workouts,sets,defaultUnit,refresh,onSave}:any){
  const [sid,setSid]=useState<number|undefined>(initialSubtype?.id); const subtype=subtypes.find((s:Subtype)=>s.id===sid)||initialSubtype;
  const [unit,setUnit]=useState<Unit>(subtype?.defaultUnit||defaultUnit); const [extra,setExtra]=useState(0); const [values,setValues]=useState<Record<string,string|boolean>>({}); const [prMessage,setPrMessage]=useState('');
  useEffect(()=>{const out:Record<string,string|boolean>={}; subtype?.settings?.forEach((s:MachineSetting)=>out[s.id]=s.defaultValue??(s.type==='checkbox'?false:'')); setValues(out); setUnit(subtype?.defaultUnit||defaultUnit)},[sid]);
  const prev=previousSets(ex.id,subtype?.id,workout,workouts,sets);
  const todaySets=sets.filter((s:WorkoutSet)=>s.workoutId===workout.id&&s.exerciseId===ex.id&&(subtype?.id?s.subtypeId===subtype.id:true));

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
      <summary><div className="loggerTitle"><span>{subtype?.photo?<img src={blobUrl(subtype.photo)}/>:<Dumbbell/>}</span><div><h3>{ex.name}</h3><p>{subtype?.name||'No subtype selected'}</p></div></div></summary>
      <div className="grid2"><label>Subtype<select value={sid??''} onChange={e=>setSid(e.target.value?Number(e.target.value):undefined)}><option value="">No subtype</option>{subtypes.map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}</select></label><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select></label></div>
      {prMessage && <div className="prToastInline">{prMessage}</div>}
      <div className="setTableV15">
        <div className="setHeaderV15"><span>Set</span><span>Previous</span><span>Weight</span><span>Reps</span><span>RIR</span><span></span></div>
        {Array.from({length:item.sets+extra}).map((_,i)=>{
          const n=i+1; const p=prev.find((x:WorkoutSet)=>x.setNumber===n); const saved=todaySets.find((s:WorkoutSet)=>s.setNumber===n);
          const pw=p?Math.round(convert(p.weight,p.unit,unit)*10)/10:undefined;
          return <div className={saved?'setLineV15 completedSet':'setLineV15'} key={n}>
            <strong>{n}</strong><small>{p?`${pw}${unit} × ${p.reps}`:'—'}</small>
            <input id={`w-${item.id}-${n}`} defaultValue={saved?String(saved.weight):(pw?String(pw):'')} placeholder="kg" type="number" step=".5"/>
            <input id={`r-${item.id}-${n}`} defaultValue={saved?String(saved.reps):(p?String(p.reps):'')} placeholder="reps" type="number"/>
            <input id={`rir-${item.id}-${n}`} defaultValue={saved?.rir!==undefined?String(saved.rir):''} placeholder="RIR" type="number" step=".5"/>
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
    await db.plannedWorkouts.add({routineId:selectedRoutine, date, createdAt:now()});
    refresh();
  }
  async function removePlan(id:number|undefined){
    if(!id) return;
    await db.plannedWorkouts.delete(id);
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
          <button className="addPlanBtn" onClick={()=>planRoutine(day)}>+ Plan</button>
          {plans.map((p:PlannedWorkout)=>{ const r=routines.find((x:Routine)=>x.id===p.routineId); return <div className="plannedEventV15" style={{borderColor:r?.color||'#0f172a', color:r?.color||'#0f172a'}} key={p.id}><em>Planned</em><strong>{r?.name||'Routine'}</strong><button onClick={()=>removePlan(p.id)}>Remove</button></div> })}
          {ws.map((w:Workout)=>{ const r=routines.find((x:Routine)=>x.id===w.routineId); const ss=sets.filter((s:WorkoutSet)=>s.workoutId===w.id); const vol=ss.reduce((a:number,s:WorkoutSet)=>a+volumeKg(s),0); return <div className="completedEventV15" style={{background:r?.color||'#0f172a'}} key={w.id}><em>Completed</em><strong>{r?.name||w.title}</strong><span>{ss.length} sets · {fmtVol(vol)}</span></div> })}
        </Card>
      })}
    </div>
  </section>
}
function StatsPage({data}:any){
  const {settings,exercises,workouts,sets}=data;
  const [eid,setEid]=useState<number|undefined>(exercises[0]?.id);
  const filtered=sets.filter((s:WorkoutSet)=>s.exerciseId===eid);
  const weeklyVolumes = weeklyVolumeByBucket(exercises, workouts, sets);
  const totalWeeklyVolume = Object.values(weeklyVolumes).reduce((a,b)=>a+b,0);
  const maxVolume = Math.max(...Object.values(weeklyVolumes), 1);

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
      <h3>Exercise Progress</h3>
      <select value={eid??''} onChange={e=>setEid(Number(e.target.value))}>
        {exercises.map((e:Exercise)=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      {filtered.length ? filtered.slice(-12).map((s:WorkoutSet)=>
        <div className="prev" key={s.id}>
          Set {s.setNumber}: {Math.round(convert(s.weight,s.unit,settings.unit)*10)/10}{settings.unit} × {s.reps} · e1RM {e1rm(convert(s.weight,s.unit,settings.unit),s.reps)}{settings.unit}
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


function MorePage({data}:any){
  const {setPage, exercises, subtypes, routines}=data;
  const items = [
    {title:'Exercises', subtitle:`${exercises.length} saved`, page:'exercises'},
    {title:'Machine Subtypes', subtitle:`${subtypes.length} saved`, page:'subtypes'},
    {title:'Routines', subtitle:`${routines.length} templates`, page:'routines'},
    {title:'Stats', subtitle:'Spider chart and weekly volume', page:'stats'},
    {title:'Backups', subtitle:'Export, import and restore points', page:'backup'},
    {title:'Settings', subtitle:'Theme, unit and local data', page:'settings'}
  ];
  return <section>
    <Card cls="hero"><h2>More</h2><p>Manage your exercises, machines, routines, backups and settings.</p></Card>
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
  const {exercises,routines,workouts,sets}=data;
  const [selectedId,setSelectedId]=useState<number|undefined>();
  const completed = workouts.filter((w:Workout)=>w.endedAt).sort((a:Workout,b:Workout)=>b.startedAt.localeCompare(a.startedAt));
  const selected = completed.find((w:Workout)=>w.id===selectedId);

  if(selected){
    const ss = workoutSetsFor(selected, sets);
    const grouped = exercises.map((ex:Exercise)=>({ex, rows:ss.filter((s:WorkoutSet)=>s.exerciseId===ex.id)})).filter((x:any)=>x.rows.length);
    return <section>
      <Card cls="premiumCard"><button className="secondary mini" onClick={()=>setSelectedId(undefined)}>← Back to history</button><h2>{selected.title}</h2><p className="muted">{selected.date} · {durationMinutes(selected)} min · {ss.length} sets · {fmtVol(workoutVolume(selected,sets))}</p></Card>
      {grouped.map((g:any)=><Card key={g.ex.id} cls="historyExercise">
        <h3>{g.ex.name}</h3>
        {g.rows.sort((a:WorkoutSet,b:WorkoutSet)=>a.setNumber-b.setNumber).map((s:WorkoutSet)=><div className="historySet" key={s.id}><span>Set {s.setNumber}</span><strong>{s.weight}{s.unit} × {s.reps}</strong><em>{fmtVol(volumeKg(s))}</em></div>)}
      </Card>)}
    </section>
  }

  return <section>
    <Card cls="hero heroV12"><h2>Workout History</h2><p>Review your completed sessions, volume, duration and exercises.</p></Card>
    {completed.length ? completed.map((w:Workout)=>{
      const routine = routines.find((r:Routine)=>r.id===w.routineId);
      const ss = workoutSetsFor(w, sets);
      return <Card key={w.id} cls="historyCard" onClick={()=>setSelectedId(w.id)}>
        <div className="historyAccent" style={{background:routine?.color||'#2563eb'}}/>
        <div><h3>{w.title}</h3><p>{new Date(w.date).toLocaleDateString([], {weekday:'short', day:'numeric', month:'short'})}</p></div>
        <div className="historyStats"><strong>{fmtVol(workoutVolume(w,sets))}</strong><span>{ss.length} sets · {durationMinutes(w)} min</span></div>
      </Card>
    }) : <Card><p className="muted">No completed workouts yet.</p></Card>}
  </section>
}

function ProgressPage({data}:any){
  const {settings,exercises,subtypes,workouts,sets}=data;
  const [eid,setEid]=useState<number|undefined>(exercises[0]?.id);
  const [sid,setSid]=useState<number|undefined>();
  const filtered = sets.filter((s:WorkoutSet)=>s.exerciseId===eid && (!sid || s.subtypeId===sid)).sort((a: WorkoutSet, b: WorkoutSet)=>a.createdAt.localeCompare(b.createdAt));
  const recent = filtered.slice(-12);
  const maxWeight = Math.max(...recent.map((s:WorkoutSet)=>convert(s.weight,s.unit,settings.unit)),1);
  const maxVol = Math.max(...recent.map((s:WorkoutSet)=>volumeKg(s)),1);
  return <section>
    <Card><h3>Progress charts</h3><select value={eid??''} onChange={e=>{setEid(Number(e.target.value));setSid(undefined)}}>{exercises.map((e:Exercise)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={sid??''} onChange={e=>setSid(e.target.value?Number(e.target.value):undefined)}><option value="">All subtypes</option>{subtypes.filter((s:Subtype)=>s.exerciseId===eid).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Card>
    <Card><h3>Weight trend</h3>{recent.length?recent.map((s:WorkoutSet,i:number)=><div className="trendRow" key={s.id}><span>#{i+1}</span><div><b style={{width:`${(convert(s.weight,s.unit,settings.unit)/maxWeight)*100}%`}}/></div><em>{Math.round(convert(s.weight,s.unit,settings.unit)*10)/10}{settings.unit} × {s.reps}</em></div>):<p className="muted">No data yet.</p>}</Card>
    <Card><h3>Volume trend</h3>{recent.length?recent.map((s:WorkoutSet,i:number)=><div className="trendRow" key={s.id}><span>#{i+1}</span><div><b style={{width:`${(volumeKg(s)/maxVol)*100}%`}}/></div><em>{fmtVol(volumeKg(s))}</em></div>):<p className="muted">No data yet.</p>}</Card>
  </section>
}
