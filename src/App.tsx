
import { useEffect, useMemo, useState } from 'react';
import Dexie, { Table } from 'dexie';
import { createClient } from '@supabase/supabase-js';
import { Activity, BarChart3, CalendarDays, Check, Dumbbell, Home, ImagePlus, ListChecks, Moon, Play, Plus, Settings, Sun, Trash2 } from 'lucide-react';

type Unit = 'kg' | 'lb';
type Theme = 'light' | 'dark';
type Page = 'home' | 'exercises' | 'exerciseDetail' | 'subtypes' | 'routines' | 'log' | 'calendar' | 'progress' | 'stats' | 'backup' | 'settings' | 'more';
type SettingType = 'dropdown' | 'checkbox' | 'text';

type AppSettings = { id: 'settings'; unit: Unit; theme: Theme };
type CloudConfig = { id: string; supabaseUrl?: string; supabaseAnonKey?: string; syncKey?: string; syncEnabled: boolean; lastSync?: string };
type Exercise = { id?: number; name: string; muscle: string; equipment: string; createdAt: string };
type MachineSetting = { id: string; label: string; type: SettingType; options?: string[]; defaultValue?: string | boolean };
type Subtype = { id?: number; exerciseId: number; name: string; defaultUnit: Unit; photo?: Blob; settings: MachineSetting[]; createdAt: string };
type Routine = { id?: number; name: string; color: string; archived?: boolean; createdAt: string };
type RoutineExercise = { id?: number; routineId: number; exerciseId: number; subtypeId?: number; order: number; sets: number; reps: string; rest: number; createdAt: string };
type Workout = { id?: number; routineId?: number; title: string; date: string; startedAt: string; endedAt?: string };
type WorkoutSet = { id?: number; workoutId: number; exerciseId: number; subtypeId?: number; setNumber: number; weight: number; reps: number; unit: Unit; rir?: number; completed: boolean; settingValues?: Record<string, string | boolean>; createdAt: string };

class LiftDB extends Dexie {
  settings!: Table<AppSettings, string>;
  exercises!: Table<Exercise, number>;
  subtypes!: Table<Subtype, number>;
  routines!: Table<Routine, number>;
  routineExercises!: Table<RoutineExercise, number>;
  workouts!: Table<Workout, number>;
  sets!: Table<WorkoutSet, number>;
  cloud!: Table<CloudConfig, string>;
  constructor() {
    super('liftlog_v10_supabase_sync_db');
    this.version(1).stores({
      settings: 'id',
      exercises: '++id,name,muscle,equipment',
      subtypes: '++id,exerciseId,name,defaultUnit',
      routines: '++id,name,color',
      routineExercises: '++id,routineId,exerciseId,subtypeId,order',
      workouts: '++id,routineId,date',
      sets: '++id,workoutId,exerciseId,subtypeId,createdAt',
      cloud: 'id'
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
  const topMuscle = Object.entries(muscleVolumes).sort((a,b)=>b[1]-a[1])[0];
  const uniqueExercises = new Set(workoutSets.map(s => s.exerciseId)).size;
  const bestSet = [...workoutSets].sort((a,b)=>volumeKg(b)-volumeKg(a))[0];
  const bestE1RMSet = [...workoutSets].sort((a,b)=>e1rm(kgValue(b), b.reps)-e1rm(kgValue(a), a.reps))[0];
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

const muscles = ['Abs','Obliques','Hamstrings','Quadriceps','Calves','Glutes','Chest','Front Delt','Rear Delt','Side Delt','Triceps','Upper Back','Erectors','Lats','Biceps','Other'];
const equipment = ['Machine','Cable','Dumbbell','Barbell','Smith Machine','Bodyweight','Other'];
const colours = ['#7c3aed','#2563eb','#16a34a','#dc2626','#ea580c','#0891b2','#db2777','#4b5563'];

async function seed() {
  if (!await db.settings.get('settings')) await db.settings.put({ id:'settings', unit:'kg', theme:'light' });
  if (!await db.cloud.get('cloud')) await db.cloud.put({ id:'cloud', syncEnabled:false, syncKey:'' });
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
  const heaviest = [...exerciseSets].sort((a,b)=>kgValue(b)-kgValue(a))[0];
  const bestVolumeSet = [...exerciseSets].sort((a,b)=>volumeKg(b)-volumeKg(a))[0];
  const bestE1RM = [...exerciseSets].sort((a,b)=>e1rm(kgValue(b),b.reps)-e1rm(kgValue(a),a.reps))[0];
  const mostReps = [...exerciseSets].sort((a,b)=>b.reps-a.reps)[0];
  const totalVolume = exerciseSets.reduce((a,s)=>a+volumeKg(s),0);
  return { heaviest, bestVolumeSet, bestE1RM, mostReps, totalVolume, setCount: exerciseSets.length };
}

function lastSessionsForExercise(exerciseId: number | undefined, workouts: Workout[], sets: WorkoutSet[], limit = 5) {
  if (!exerciseId) return [];
  const byWorkout = workouts
    .map(w => ({ workout: w, sets: sets.filter(s => s.workoutId === w.id && s.exerciseId === exerciseId) }))
    .filter(row => row.sets.length)
    .sort((a,b)=>b.workout.date.localeCompare(a.workout.date))
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
  const [activeWorkoutId, setActiveWorkoutId] = useState<number|undefined>();
  const [selectedExerciseId, setSelectedExerciseId] = useState<number|undefined>();
  const [cloud, setCloud] = useState<CloudConfig>({id:'cloud',syncEnabled:false});

  async function refresh() {
    setSettings(await db.settings.get('settings') || {id:'settings',unit:'kg',theme:'light'});
    setExercises(await db.exercises.orderBy('name').toArray());
    setSubtypes(await db.subtypes.toArray());
    setRoutines(await db.routines.orderBy('name').toArray());
    setRoutineExercises(await db.routineExercises.toArray());
    setWorkouts(await db.workouts.orderBy('date').reverse().toArray());
    setSets(await db.sets.toArray());
    setCloud(await db.cloud.get('cloud') || {id:'cloud',syncEnabled:false});
  }
  useEffect(()=>{ seed().then(refresh); },[]);
  useEffect(()=>{ document.body.dataset.theme = settings.theme; },[settings.theme]);
  const activeWorkout = workouts.find(w=>w.id===activeWorkoutId);

  return <div className="shell">
    <header className="topbar">
      <div><div className="eyebrow">LiftLog</div><h1>{title(page)}</h1></div>
      <button className="iconBtn" onClick={async()=>{await db.settings.put({...settings,theme:settings.theme==='light'?'dark':'light'}); refresh();}}>{settings.theme==='light'?<Moon/>:<Sun/>}</button>
    </header>
    <main>
      {page==='home' && <HomePage data={{exercises,subtypes,routines,workouts,sets,setPage}} />}
      {page==='exercises' && <ExercisesPage data={{exercises,subtypes,sets,workouts,refresh,setPage,setSelectedExerciseId}} />}
      {page==='exerciseDetail' && <ExerciseDetailPage data={{selectedExerciseId,exercises,subtypes,workouts,sets,setPage}} />}
      {page==='subtypes' && <SubtypesPage data={{exercises,subtypes,refresh}} />}
      {page==='routines' && <RoutinesPage data={{exercises,subtypes,routines,routineExercises,refresh}} />}
      {page==='log' && <LogPage data={{settings,exercises,subtypes,routines,routineExercises,workouts,sets,activeWorkout,setActiveWorkoutId,refresh}} />}
      {page==='calendar' && <CalendarPage data={{routines,workouts,sets}} />}
      {page==='progress' && <ProgressPage data={{settings,exercises,subtypes,workouts,sets}} />}
      {page==='more' && <MorePage data={{setPage,exercises,subtypes,routines}} />}
      {page==='stats' && <StatsPage data={{settings,exercises,workouts,sets}} />}
      {page==='backup' && <BackupPage data={{cloud,refresh}} />}
      {page==='settings' && <SettingsPage data={{settings,refresh}} />}
    </main>
    <nav className="tabs fiveTabs">
      <Tab p="home" page={page} setPage={setPage} icon={<Home/>} label="Home"/>
      <Tab p="log" page={page} setPage={setPage} icon={<Play/>} label="Workout"/>
      <Tab p="calendar" page={page} setPage={setPage} icon={<CalendarDays/>} label="Calendar"/>
      <Tab p="progress" page={page} setPage={setPage} icon={<BarChart3/>} label="Progress"/>
      <Tab p="more" page={page} setPage={setPage} icon={<Settings/>} label="More"/>
    </nav>
  </div>
}
function title(p:Page){return {home:'Dashboard',exercises:'Exercises',subtypes:'Subtypes',routines:'Routines',log:'Workout',calendar:'Calendar',stats:'Stats',settings:'Settings',exerciseDetail:'Exercise Detail',progress:'Progress',backup:'Backup',more:'More'}[p]}
function Tab({p,page,setPage,icon,label}:any){return <button className={page===p?'tab active':'tab'} onClick={()=>setPage(p)}>{icon}<span>{label}</span></button>}
function Card({children, cls=''}:any){return <div className={'card '+cls}>{children}</div>}
function Pills({children}:any){return <div className="pills">{children}</div>}

function HomePage({data}:any){
  const {exercises,subtypes,routines,workouts,sets,setPage}=data;
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1);
  const week = weekStart.toISOString().slice(0,10);
  const weekWorkouts = workouts.filter((w:Workout)=>w.date>=week);
  const weekSets = sets.filter((s:WorkoutSet)=>weekWorkouts.some((w:Workout)=>w.id===s.workoutId));
  const vol = weekSets.reduce((a:number,s:WorkoutSet)=>a+volumeKg(s),0);
  const muscleCounts = new Map<string,number>();
  weekSets.forEach((s:WorkoutSet)=>{const e=exercises.find((x:Exercise)=>x.id===s.exerciseId); if(e) muscleCounts.set(e.muscle,(muscleCounts.get(e.muscle)||0)+1)})
  return <section>
    <Card cls="hero"><h2>Ready to train?</h2><p>Pick a routine, choose the exact machine subtype, and compare your previous sets.</p><button className="primary" onClick={()=>setPage('log')}>Start Workout</button></Card>
    <div className="quickActions">
      <button onClick={()=>setPage('exercises')}>Exercises</button>
      <button onClick={()=>setPage('subtypes')}>Machines</button>
      <button onClick={()=>setPage('routines')}>Routines</button>
    </div>
    <div className="grid2"><Metric n={exercises.length} l="Exercises"/><Metric n={subtypes.length} l="Subtypes"/><Metric n={routines.length} l="Routines"/><Metric n={weekSets.length} l="Sets this week"/></div>
    <Card><h3>Weekly Volume</h3><div className="big">{fmtVol(vol)}</div><p className="muted">Normalised to kg.</p></Card>
    <Card><h3>Weekly volume by group</h3>{Object.entries(weeklyVolumeByBucket(exercises, workouts, sets)).some(([,v])=>v>0) ? Object.entries(weeklyVolumeByBucket(exercises, workouts, sets)).map(([m,v])=><Heat key={m} label={m} value={Math.round(v/100)}/>) : <p className="muted">No workouts logged yet.</p>}<p className="muted">Open Stats for the spider chart.</p></Card>
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
  const items=routineExercises.filter((r:RoutineExercise)=>r.routineId===routineId).sort((a:RoutineExercise,b:RoutineExercise)=>a.order-b.order);
  return <section><Card><h3>Create Routine</h3><input placeholder="Routine name" value={routineName} onChange={e=>setRoutineName(e.target.value)}/><div className="colourRow">{colours.map(c=><button key={c} className={colour===c?'colour activeColour':'colour'} style={{background:c}} onClick={()=>setColour(c)}/>)}</div><button className="primary" onClick={create}>Create Routine</button></Card>
  <Card><h3>Edit Routine</h3><select value={routineId??''} onChange={e=>setRoutineId(Number(e.target.value))}><option value="">Choose routine</option>{routines.filter((r:Routine)=>!r.archived).map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}</select>{routineId&&<><div className="colourRow">{colours.map(c=><button key={c} className={(routines.find((r:Routine)=>r.id===routineId)?.color||'')===c?'colour activeColour':'colour'} style={{background:c}} onClick={async()=>{await db.routines.update(routineId,{color:c}); refresh();}}/>)}</div><div className="grid3">
        <button className="secondary mini" onClick={async()=>{ 
          const r = routines.find((x:Routine)=>x.id===routineId);
          if(!r || !routineId) return;
          const newId = await db.routines.add({name:r.name + ' Copy', color:r.color, archived:false, createdAt:now()});
          const items = routineExercises.filter((x:RoutineExercise)=>x.routineId===routineId).sort((a:RoutineExercise,b:RoutineExercise)=>a.order-b.order);
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

function LogPage({data}:any){
  const {settings,exercises,subtypes,routines,routineExercises,workouts,sets,activeWorkout,setActiveWorkoutId,refresh}=data;
  const [routineId,setRoutineId]=useState<number|undefined>(); 
  const [timer,setTimer]=useState<number|undefined>(); 
  const [rest,setRest]=useState(90); 
  const [,setTick]=useState(0);
  const [lastFinishedId,setLastFinishedId]=useState<number|undefined>();

  useEffect(()=>{const i=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(i)},[]);

  async function start(){ 
    if(!routineId)return alert('Choose routine'); 
    const r=routines.find((x:Routine)=>x.id===routineId); 
    const id=await db.workouts.add({routineId,title:r?.name||'Workout',date:today(),startedAt:now()}); 
    setLastFinishedId(undefined);
    setActiveWorkoutId(id); 
    refresh(); 
  }

  async function finish(){ 
    if(!activeWorkout?.id)return; 
    await db.workouts.update(activeWorkout.id,{endedAt:now()}); 
    setLastFinishedId(activeWorkout.id);
    setActiveWorkoutId(undefined); 
    refresh(); 
  }

  const lastFinished = workouts.find((w:Workout)=>w.id===lastFinishedId) || (!activeWorkout ? workouts.find((w:Workout)=>w.endedAt) : undefined);

  if(!activeWorkout) return <section>
    {lastFinished && <WorkoutSummaryCard workout={lastFinished} exercises={exercises} sets={sets}/>}
    <Card>
      <h3>Start Workout</h3>
      <select value={routineId??''} onChange={e=>setRoutineId(Number(e.target.value))}>
        <option value="">Choose routine</option>
        {routines.map((r:Routine)=><option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <button className="primary" onClick={start}>Start</button>
    </Card>
  </section>;

  const items=routineExercises.filter((r:RoutineExercise)=>r.routineId===activeWorkout.routineId).sort((a:RoutineExercise,b:RoutineExercise)=>a.order-b.order);
  const left = timer ? Math.max(0, rest - Math.floor((Date.now()-timer)/1000)) : rest;
  const liveSummary = workoutSummary(activeWorkout, exercises, sets);

  return <section>
    <Card>
      <div className="row">
        <div>
          <h3>{activeWorkout.title}</h3>
          <p className="muted">Started {new Date(activeWorkout.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {workoutDurationMinutes(activeWorkout)} min</p>
        </div>
        <button className="danger mini" onClick={finish}>Finish</button>
      </div>
      {liveSummary && <div className="liveSummary">
        <span>{liveSummary.totalSets} sets</span>
        <span>{fmtVol(liveSummary.totalVolume)}</span>
        <span>{liveSummary.uniqueExercises} exercises</span>
      </div>}
    </Card>

    <Card>
      <div className="timer">
        <strong>Rest {left}s</strong>
        <input type="number" value={rest} onChange={e=>setRest(Number(e.target.value))}/>
        <button className="secondary" onClick={()=>setTimer(Date.now())}>Start</button>
      </div>
    </Card>

    {items.map((it:RoutineExercise)=>{
      const ex=exercises.find((e:Exercise)=>e.id===it.exerciseId); 
      return <Logger key={it.id} item={it} ex={ex} subtypes={subtypes.filter((s:Subtype)=>s.exerciseId===ex?.id)} initialSubtype={subtypes.find((s:Subtype)=>s.id===it.subtypeId)} workout={activeWorkout} workouts={workouts} sets={sets} defaultUnit={settings.unit} refresh={refresh} onSave={()=>setTimer(Date.now())}/>
    })}
  </section>
}

function WorkoutSummaryCard({workout, exercises, sets}:{workout:Workout; exercises:Exercise[]; sets:WorkoutSet[]}) {
  const summary = workoutSummary(workout, exercises, sets);
  if (!summary) return null;
  const bestSetExercise = exercises.find(e=>e.id===summary.bestSet?.exerciseId);
  const bestE1RMExercise = exercises.find(e=>e.id===summary.bestE1RMSet?.exerciseId);

  return <Card cls="summaryCard">
    <h3>Workout Summary</h3>
    <p className="muted">{workout.title} · {workout.date} · {workoutDurationMinutes(workout)} min</p>
    <div className="summaryGrid">
      <div><strong>{summary.totalSets}</strong><span>Sets</span></div>
      <div><strong>{summary.uniqueExercises}</strong><span>Exercises</span></div>
      <div><strong>{fmtVol(summary.totalVolume)}</strong><span>Volume</span></div>
      <div><strong>{summary.topMuscle ? summary.topMuscle[0] : '-'}</strong><span>Top group</span></div>
    </div>
    <div className="prBox">
      <h4>Best set volume</h4>
      {summary.bestSet ? <p>{bestSetExercise?.name || 'Exercise'} · {summary.bestSet.weight}{summary.bestSet.unit} × {summary.bestSet.reps} = {fmtVol(volumeKg(summary.bestSet))}</p> : <p className="muted">No sets logged.</p>}
    </div>
    <div className="prBox">
      <h4>Best estimated 1RM</h4>
      {summary.bestE1RMSet ? <p>{bestE1RMExercise?.name || 'Exercise'} · {e1rm(kgValue(summary.bestE1RMSet), summary.bestE1RMSet.reps)}kg estimated</p> : <p className="muted">No sets logged.</p>}
    </div>
  </Card>
}

function previousSets(exerciseId:number, subtypeId:number|undefined, workout:Workout, workouts:Workout[], sets:WorkoutSet[]){
  const past=workouts.filter(w=>w.id!==workout.id&&w.date<workout.date).sort((a,b)=>b.date.localeCompare(a.date));
  for(const w of past){const found=sets.filter(s=>s.workoutId===w.id&&s.exerciseId===exerciseId&&(subtypeId?s.subtypeId===subtypeId:true)).sort((a,b)=>a.setNumber-b.setNumber); if(found.length)return found}
  return [];
}
function Logger({item,ex,subtypes,initialSubtype,workout,workouts,sets,defaultUnit,refresh,onSave}:any){
  const [sid,setSid]=useState<number|undefined>(initialSubtype?.id); const subtype=subtypes.find((s:Subtype)=>s.id===sid)||initialSubtype;
  const [unit,setUnit]=useState<Unit>(subtype?.defaultUnit||defaultUnit); const [extra,setExtra]=useState(0); const [values,setValues]=useState<Record<string,string|boolean>>({});
  const [editingSetId,setEditingSetId]=useState<number|undefined>(); const [editWeight,setEditWeight]=useState(''); const [editReps,setEditReps]=useState(''); const [editRir,setEditRir]=useState('');
  useEffect(()=>{const out:Record<string,string|boolean>={}; subtype?.settings?.forEach((s:MachineSetting)=>out[s.id]=s.defaultValue??(s.type==='checkbox'?false:'')); setValues(out); setUnit(subtype?.defaultUnit||defaultUnit)},[sid]);
  const prev=previousSets(ex.id,subtype?.id,workout,workouts,sets); const todaySets=sets.filter((s:WorkoutSet)=>s.workoutId===workout.id&&s.exerciseId===ex.id&&(subtype?.id?s.subtypeId===subtype.id:true));
  async function save(n:number){const w=(document.getElementById(`w-${item.id}-${n}`) as HTMLInputElement).value; const r=(document.getElementById(`r-${item.id}-${n}`) as HTMLInputElement).value; const rir=(document.getElementById(`rir-${item.id}-${n}`) as HTMLInputElement).value; if(!r)return alert('Enter reps'); await db.sets.add({workoutId:workout.id,exerciseId:ex.id,subtypeId:subtype?.id,setNumber:n,weight:Number(w||0),reps:Number(r),unit,rir:rir?Number(rir):undefined,completed:true,settingValues:values,createdAt:now()}); (document.getElementById(`w-${item.id}-${n}`) as HTMLInputElement).value=''; (document.getElementById(`r-${item.id}-${n}`) as HTMLInputElement).value=''; (document.getElementById(`rir-${item.id}-${n}`) as HTMLInputElement).value=''; onSave(); refresh();}
  function autofill(n:number){ const p=previousSetForNumber(ex.id, subtype?.id, n, workout, workouts, sets); if(!p)return; const w=document.getElementById(`w-${item.id}-${n}`) as HTMLInputElement; const r=document.getElementById(`r-${item.id}-${n}`) as HTMLInputElement; w.value=String(Math.round(convert(p.weight,p.unit,unit)*10)/10); r.value=String(p.reps); }
  function beginSetEdit(s:WorkoutSet){ setEditingSetId(s.id); setEditWeight(String(s.weight)); setEditReps(String(s.reps)); setEditRir(s.rir!==undefined?String(s.rir):''); }
  async function saveSetEdit(s:WorkoutSet){ await db.sets.update(s.id!,{weight:Number(editWeight||0),reps:Number(editReps||0),rir:editRir?Number(editRir):undefined}); setEditingSetId(undefined); refresh(); }
  async function deleteSet(s:WorkoutSet){ if(!confirm('Delete this logged set?')) return; await db.sets.delete(s.id!); refresh(); }
  return <Card><div className="machine smallMachine">{subtype?.photo?<img src={blobUrl(subtype.photo)}/>:<div className="placeholder">No photo</div>}<div><h3>{ex.name}</h3><p className="muted">{subtype?.name||'No subtype selected'}</p><Pills><span>{item.sets} sets</span><span>{item.reps}</span><span>Machine default: {subtype?.defaultUnit||defaultUnit}</span></Pills></div></div><div className="grid2"><label>Subtype<select value={sid??''} onChange={e=>setSid(e.target.value?Number(e.target.value):undefined)}><option value="">No subtype</option>{subtypes.map((s:Subtype)=><option key={s.id} value={s.id}>{s.name} ({s.defaultUnit})</option>)}</select></label><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value as Unit)}><option value="kg">kg</option><option value="lb">lb</option></select></label></div>{subtype?.settings?.length>0&&<details open><summary>Machine settings</summary>{subtype.settings.map((s:MachineSetting)=><div className="setting" key={s.id}><label>{s.label}</label>{s.type==='dropdown'&&<select value={String(values[s.id]??'')} onChange={e=>setValues({...values,[s.id]:e.target.value})}>{s.options?.map(o=><option key={o}>{o}</option>)}</select>}{s.type==='checkbox'&&<input type="checkbox" checked={Boolean(values[s.id])} onChange={e=>setValues({...values,[s.id]:e.target.checked})}/>} {s.type==='text'&&<input value={String(values[s.id]??'')} onChange={e=>setValues({...values,[s.id]:e.target.value})}/>}</div>)}</details>}<details open><summary>Previous selected subtype</summary>{prev.length?prev.map((s:WorkoutSet)=><div className="prev" key={s.id}>Set {s.setNumber}: <b>{Math.round(convert(s.weight,s.unit,unit)*10)/10}{unit}</b> × {s.reps}</div>):<p className="muted">No previous sets.</p>}</details>{todaySets.length>0&&<details open><summary>Saved today</summary>{todaySets.map((s:WorkoutSet)=><div className="done editableSet" key={s.id}>{editingSetId===s.id ? <><span>Set {s.setNumber}</span><input value={editWeight} onChange={e=>setEditWeight(e.target.value)} type="number" step=".5"/><input value={editReps} onChange={e=>setEditReps(e.target.value)} type="number"/><input value={editRir} onChange={e=>setEditRir(e.target.value)} type="number" step=".5"/><button className="smallAction" onClick={()=>saveSetEdit(s)}>Save</button><button className="smallAction" onClick={()=>setEditingSetId(undefined)}>Cancel</button></> : <><Check/> <span>Set {s.setNumber}: {s.weight}{s.unit} × {s.reps}</span><button className="smallAction" onClick={()=>beginSetEdit(s)}>Edit</button><button className="trash tinyTrash" onClick={()=>deleteSet(s)}><Trash2/></button></>}</div>)}</details>}<label className="inline">Extra sets <input type="number" value={extra} onChange={e=>setExtra(Number(e.target.value))}/></label>{Array.from({length:item.sets+extra}).map((_,i)=>{const n=i+1; const p=prev.find((x:WorkoutSet)=>x.setNumber===n); const pw=p?Math.round(convert(p.weight,p.unit,unit)*10)/10:undefined; return <div className="setrow" key={n}><span><input type="checkbox" checked={todaySets.some((s:WorkoutSet)=>s.setNumber===n)} readOnly/> Set {n}</span><input id={`w-${item.id}-${n}`} placeholder={pw?`Prev ${pw}`:'Weight'} type="number" step=".5"/><input id={`r-${item.id}-${n}`} placeholder={p?`Prev ${p.reps}`:'Reps'} type="number"/><input id={`rir-${item.id}-${n}`} placeholder="RIR" type="number" step=".5"/><button className="secondary compactBtn" type="button" onClick={()=>autofill(n)}>Fill</button><button onClick={()=>save(n)}>Save</button></div>})}</Card>
}

function CalendarPage({data}:any){const {routines,workouts,sets}=data; const days=Array.from({length:35}).map((_,i)=>{const d=new Date();d.setDate(d.getDate()-17+i);return d.toISOString().slice(0,10)}); return <section><div className="calendar">{days.map(day=>{const ws=workouts.filter((w:Workout)=>w.date===day);return <Card key={day} cls={day===today()?'day today':'day'}><strong>{new Date(day).toLocaleDateString([], {day:'numeric',month:'short'})}</strong>{ws.map((w:Workout)=>{const r=routines.find((x:Routine)=>x.id===w.routineId); const ss=sets.filter((s:WorkoutSet)=>s.workoutId===w.id); const vol=ss.reduce((a:number,s:WorkoutSet)=>a+volumeKg(s),0); return <div className="event" style={{background:r?.color||'#0f172a'}} key={w.id}>{r?.name||w.title}<br/><span>{ss.length} sets · {fmtVol(vol)}</span></div>})}</Card>})}</div></section>}
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
    {title:'Backup + Cloud', subtitle:'Export, import and Supabase settings', page:'backup'},
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
    const payload={settings:await db.settings.toArray(),cloud:await db.cloud.toArray(),exercises:await db.exercises.toArray(),subtypes:await db.subtypes.toArray(),routines:await db.routines.toArray(),routineExercises:await db.routineExercises.toArray(),workouts:await db.workouts.toArray(),sets:await db.sets.toArray()}; 
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})); a.download='liftlog-v10-export.json'; a.click()
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


async function buildLiftLogPayload() {
  return {
    exportedAt: new Date().toISOString(),
    app: 'LiftLog',
    version: 10,
    settings: await db.settings.toArray(),
    exercises: await db.exercises.toArray(),
    subtypes: await db.subtypes.toArray(),
    routines: await db.routines.toArray(),
    routineExercises: await db.routineExercises.toArray(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray()
  };
}

async function replaceLocalDataFromPayload(payload:any) {
  if (!payload) throw new Error('No payload found.');

  await db.settings.clear();
  await db.exercises.clear();
  await db.subtypes.clear();
  await db.routines.clear();
  await db.routineExercises.clear();
  await db.workouts.clear();
  await db.sets.clear();

  if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
  else await db.settings.put({id:'settings',unit:'kg',theme:'light'});

  if (payload.exercises?.length) await db.exercises.bulkPut(payload.exercises);
  if (payload.subtypes?.length) await db.subtypes.bulkPut(payload.subtypes);
  if (payload.routines?.length) await db.routines.bulkPut(payload.routines);
  if (payload.routineExercises?.length) await db.routineExercises.bulkPut(payload.routineExercises);
  if (payload.workouts?.length) await db.workouts.bulkPut(payload.workouts);
  if (payload.sets?.length) await db.sets.bulkPut(payload.sets);
}

async function syncKeyHash(syncKey:string) {
  const clean = syncKey.trim();
  if (!clean) throw new Error('Enter a private sync code first.');
  const data = new TextEncoder().encode(clean);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function makeSupabaseClient(url:string|undefined, key:string|undefined) {
  if (!url || !key) throw new Error('Enter Supabase URL and anon key first.');
  return createClient(url, key);
}

async function uploadLiftLogToCloud(cloud:CloudConfig) {
  const client = makeSupabaseClient(cloud.supabaseUrl, cloud.supabaseAnonKey);
  const keyHash = await syncKeyHash(cloud.syncKey || '');
  const payload = await buildLiftLogPayload();
  const { error } = await client
    .from('liftlog_sync')
    .upsert({ sync_key_hash: keyHash, payload, updated_at: new Date().toISOString() }, { onConflict: 'sync_key_hash' });
  if (error) throw error;
  return payload;
}

async function downloadLiftLogFromCloud(cloud:CloudConfig) {
  const client = makeSupabaseClient(cloud.supabaseUrl, cloud.supabaseAnonKey);
  const keyHash = await syncKeyHash(cloud.syncKey || '');
  const { data, error } = await client
    .from('liftlog_sync')
    .select('payload, updated_at')
    .eq('sync_key_hash', keyHash)
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) throw new Error('No cloud backup found for this sync code.');
  await replaceLocalDataFromPayload(data.payload);
  return data;
}

function BackupPage({data}:any){
  const {cloud,refresh}=data;
  const [url,setUrl]=useState(cloud.supabaseUrl||'');
  const [key,setKey]=useState(cloud.supabaseAnonKey||'');
  const [syncKey,setSyncKey]=useState(cloud.syncKey||'');
  const [enabled,setEnabled]=useState(Boolean(cloud.syncEnabled));
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);

  async function save(){
    await db.cloud.put({id:'cloud',supabaseUrl:url,supabaseAnonKey:key,syncKey,syncEnabled:enabled,lastSync:cloud.lastSync});
    refresh();
    setStatus('Cloud settings saved.');
  }

  async function doUpload(){
    try{
      setBusy(true);
      const current: CloudConfig = {id:'cloud',supabaseUrl:url,supabaseAnonKey:key,syncKey,syncEnabled:enabled,lastSync:new Date().toISOString()};
      await db.cloud.put(current);
      await uploadLiftLogToCloud(current);
      await db.cloud.put({...current,lastSync:new Date().toISOString()});
      setStatus('Upload complete. Cloud now matches this device.');
      refresh();
    }catch(err:any){
      setStatus('Upload failed: ' + (err.message || String(err)));
    }finally{
      setBusy(false);
    }
  }

  async function doDownload(){
    if(!confirm('Download cloud data to this device? This replaces local LiftLog data on this browser.')) return;
    try{
      setBusy(true);
      const current: CloudConfig = {id:'cloud',supabaseUrl:url,supabaseAnonKey:key,syncKey,syncEnabled:enabled,lastSync:new Date().toISOString()};
      await db.cloud.put(current);
      await downloadLiftLogFromCloud(current);
      await db.cloud.put({...current,lastSync:new Date().toISOString()});
      setStatus('Download complete. This device now matches cloud.');
      refresh();
    }catch(err:any){
      setStatus('Download failed: ' + (err.message || String(err)));
    }finally{
      setBusy(false);
    }
  }

  return <section>
    <Card cls="hero"><h2>Cloud Sync</h2><p>Manual sync for PC ↔ iPhone. Upload from one device, then download on the other.</p></Card>

    <Card>
      <h3>1. Supabase settings</h3>
      <input placeholder="Supabase project URL" value={url} onChange={e=>setUrl(e.target.value)}/>
      <input placeholder="Supabase anon public key" value={key} onChange={e=>setKey(e.target.value)}/>
      <input placeholder="Private sync code e.g. ashray-liftlog-2026" value={syncKey} onChange={e=>setSyncKey(e.target.value)}/>
      <label className="checkLine"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable sync on this device</label>
      <button className="primary" onClick={save} disabled={busy}>Save settings</button>
      <p className="muted">Use the same URL, anon key and private sync code on your PC and iPhone.</p>
    </Card>

    <Card>
      <h3>2. Manual sync</h3>
      <button className="primary" disabled={busy || !enabled} onClick={doUpload}>Upload this device to cloud</button>
      <button className="secondary" disabled={busy || !enabled} onClick={doDownload}>Download cloud to this device</button>
      <p className="muted">Last sync/check: {cloud.lastSync ? new Date(cloud.lastSync).toLocaleString() : 'Never'}</p>
      {status && <div className="syncStatus">{status}</div>}
    </Card>

    <Card>
      <h3>How to use safely</h3>
      <ol className="steps">
        <li>On the device with the best/current data, press <strong>Upload this device to cloud</strong>.</li>
        <li>On your other device, press <strong>Download cloud to this device</strong>.</li>
        <li>Do not edit both devices separately before syncing, or you may overwrite one side.</li>
      </ol>
    </Card>
  </section>
}

function ProgressPage({data}:any){
  const {settings,exercises,subtypes,workouts,sets}=data;
  const [eid,setEid]=useState<number|undefined>(exercises[0]?.id);
  const [sid,setSid]=useState<number|undefined>();
  const filtered = sets.filter((s:WorkoutSet)=>s.exerciseId===eid && (!sid || s.subtypeId===sid)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const recent = filtered.slice(-12);
  const maxWeight = Math.max(...recent.map((s:WorkoutSet)=>convert(s.weight,s.unit,settings.unit)),1);
  const maxVol = Math.max(...recent.map((s:WorkoutSet)=>volumeKg(s)),1);
  return <section>
    <Card><h3>Progress charts</h3><select value={eid??''} onChange={e=>{setEid(Number(e.target.value));setSid(undefined)}}>{exercises.map((e:Exercise)=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={sid??''} onChange={e=>setSid(e.target.value?Number(e.target.value):undefined)}><option value="">All subtypes</option>{subtypes.filter((s:Subtype)=>s.exerciseId===eid).map((s:Subtype)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Card>
    <Card><h3>Weight trend</h3>{recent.length?recent.map((s:WorkoutSet,i:number)=><div className="trendRow" key={s.id}><span>#{i+1}</span><div><b style={{width:`${(convert(s.weight,s.unit,settings.unit)/maxWeight)*100}%`}}/></div><em>{Math.round(convert(s.weight,s.unit,settings.unit)*10)/10}{settings.unit} × {s.reps}</em></div>):<p className="muted">No data yet.</p>}</Card>
    <Card><h3>Volume trend</h3>{recent.length?recent.map((s:WorkoutSet,i:number)=><div className="trendRow" key={s.id}><span>#{i+1}</span><div><b style={{width:`${(volumeKg(s)/maxVol)*100}%`}}/></div><em>{fmtVol(volumeKg(s))}</em></div>):<p className="muted">No data yet.</p>}</Card>
  </section>
}
