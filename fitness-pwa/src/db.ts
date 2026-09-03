import Dexie, { type Table } from 'dexie';

export interface Exercise {
  id?: number;
  name: string;
  muscleGroup: string;
  description: string;
  type?: 'strength' | 'cardio'; // 默认为 strength
  loadType?: 'external' | 'bodyweight' | 'bodyweight-added' | 'assisted';
  equipment?: string;
  movementPattern?: string;
  recordingMode?: 'weight_reps' | 'bodyweight_reps' | 'timed_hold' | 'distance_time' | 'time_level' | 'swim' | 'interval';
  weightInputMode?: 'total' | 'per_implement';
  implementCount?: number;
  bodyweightFactor?: number;
  countInVolume?: boolean;
  supports1RM?: boolean;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  isCustom?: boolean;
  note?: string; // 动作器械/孔位备忘 (如：座椅4档，把手外侧)
}

export interface PlannedExercise {
  exerciseId: number;
  order: number;
  targetSets: number;
  minReps: number;
  maxReps: number;
  targetWeight?: number;
  targetRpe?: number;
  restSeconds: number;
  notes?: string;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetLevel?: number;
}

export interface WorkoutTemplate {
  id?: number;
  name: string;
  exerciseIds: number[];
  exercises?: PlannedExercise[];
  scheduledDays?: number[]; // 0 = 周日, 1 = 周一, ..., 6 = 周六
}

export interface WorkoutSession {
  id?: number;
  templateId?: number;
  startTime: Date;
  endTime?: Date;
  notes: string;
  bodyWeight?: number;
}
export interface WorkoutSet {
  id?: number;
  sessionId: number;
  exerciseId: number;
  setNumber: number;
  weight: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  duration?: number; // 持续时间 (分钟)
  distance?: number; // 距离 (km)
  durationSeconds?: number;
  distanceMeters?: number;
  setKind?: 'warmup' | 'working' | 'drop' | 'failure';
  level?: number;
  incline?: number;
  heartRate?: number;
  cadence?: number;
  strokeRate?: number;
  poolLengthMeters?: number;
  swimStroke?: string;
  workSeconds?: number;
  recoverySeconds?: number;
  intervals?: number;
  loadType?: Exercise['loadType'];
}

export function exerciseDefaults(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'type'>): Partial<Exercise> {
  const { name, muscleGroup, type } = exercise;
  const muscleParts = muscleGroup.split('/');
  const fixedMachineNames = ['蝴蝶机', '腿举', '腿屈伸', '腿弯举', '坐姿划船'];
  const cardioEquipment: Record<string, string> = {
    跑步机跑步: '跑步机',
    户外跑步: '户外',
    动感单车: '动感单车',
    椭圆机: '椭圆机',
    划船机: '划船机',
    爬楼机: '爬楼机',
    游泳: '泳池'
  };
  const base: Partial<Exercise> = {
    primaryMuscles: [muscleParts[0]],
    secondaryMuscles: muscleParts.slice(1),
    weightInputMode: 'total',
    implementCount: 1,
    bodyweightFactor: 1,
    countInVolume: type !== 'cardio',
    equipment: type === 'cardio'
      ? cardioEquipment[name] || '有氧器械'
      : name.includes('哑铃')
        ? '哑铃'
        : name.includes('杠铃') || name.includes('硬拉')
          ? '杠铃'
          : name.includes('绳索') || name.includes('下拉')
            ? '绳索器械'
            : fixedMachineNames.some(keyword => name.includes(keyword))
              ? '固定器械'
              : '自重/通用',
    movementPattern: name.includes('卧推') || name.includes('俯卧撑') ? '水平推' : name.includes('划船') ? '水平拉' : name.includes('引体') || name.includes('下拉') ? '垂直拉' : name.includes('推举') ? '垂直推' : name.includes('深蹲') || name.includes('腿举') ? '蹲' : name.includes('硬拉') || name.includes('臀推') ? '髋主导' : type === 'cardio' ? '有氧' : muscleParts[0]
  };
  if (type === 'cardio') {
    if (name === '游泳') return { ...base, recordingMode: 'swim', countInVolume: false };
    if (name === '椭圆机' || name === '爬楼机') return { ...base, recordingMode: 'time_level', countInVolume: false };
    return { ...base, recordingMode: 'distance_time', countInVolume: false };
  }
  if (name === '平板支撑') return { ...base, recordingMode: 'timed_hold', loadType: 'bodyweight-added', countInVolume: false, supports1RM: false };
  if (['卷腹', '悬垂举腿', '俄罗斯转体'].includes(name)) {
    return { ...base, recordingMode: 'bodyweight_reps', loadType: 'bodyweight-added', countInVolume: false, supports1RM: false };
  }
  if (name === '俯卧撑') return { ...base, recordingMode: 'bodyweight_reps', loadType: 'bodyweight-added', bodyweightFactor: 0.65, supports1RM: false };
  if (name === '引体向上') return { ...base, recordingMode: 'bodyweight_reps', loadType: 'bodyweight-added', supports1RM: true };
  const isDumbbell = name.includes('哑铃') && name !== '过头臂屈伸';
  return {
    ...base,
    recordingMode: 'weight_reps',
    weightInputMode: isDumbbell ? 'per_implement' : 'total',
    implementCount: isDumbbell ? 2 : 1,
    supports1RM: true
  };
}

export interface BodyMetric {
  id?: number;
  date: Date;
  weight: number;
  bodyFat?: number; // 比例/百分比
  waist?: number;
  chest?: number;
  arm?: number;
  hips?: number;
  photo?: Blob;
}

export interface UserProfile {
  id: 'current';
  gender: 'male' | 'female';
  age: number;
  height: number;
  weight: number;
  activity: number;
  goal: 'cut' | 'maintain' | 'bulk';
  calorieAdjustment?: number;
}

export interface NutritionEntry {
  id?: number;
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipeId?: number;
}

export interface Recipe {
  id?: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Supplement {
  id?: number;
  name: string;
}

export interface SupplementCheck {
  id?: number;
  supplementId: number;
  date: string;
}

export class FitnessDB extends Dexie {
  exercises!: Table<Exercise>;
  workoutTemplates!: Table<WorkoutTemplate>;
  workoutSessions!: Table<WorkoutSession>;
  workoutSets!: Table<WorkoutSet>;
  bodyMetrics!: Table<BodyMetric>;
  userProfiles!: Table<UserProfile, 'current'>;
  nutritionEntries!: Table<NutritionEntry>;
  recipes!: Table<Recipe>;
  supplements!: Table<Supplement>;
  supplementChecks!: Table<SupplementCheck>;

  constructor() {
    super('FitnessDB');
    this.version(1).stores({
      exercises: '++id, name, muscleGroup',
      workoutTemplates: '++id, name',
      workoutSessions: '++id, templateId, startTime',
      workoutSets: '++id, sessionId, exerciseId, completed'
    });
    this.version(2).stores({
      bodyMetrics: '++id, date'
    });
    this.version(3).stores({
      userProfiles: 'id',
      nutritionEntries: '++id, date, recipeId',
      recipes: '++id, name',
      supplements: '++id, name',
      supplementChecks: '++id, supplementId, date, [supplementId+date]'
    }).upgrade(async tx => {
      const templates = await tx.table('workoutTemplates').toArray() as WorkoutTemplate[];
      for (const template of templates) {
        if (!template.exercises) {
          template.exercises = template.exerciseIds.map((exerciseId, order) => ({
            exerciseId,
            order,
            targetSets: 3,
            minReps: 8,
            maxReps: 12,
            targetRpe: 8,
            restSeconds: 90
          }));
          await tx.table('workoutTemplates').put(template);
        }
      }
    });
    this.version(4).stores({}).upgrade(async tx => {
      const exercises = await tx.table('exercises').toArray() as Exercise[];
      for (const exercise of exercises) {
        await tx.table('exercises').put({ ...exerciseDefaults(exercise), ...exercise });
      }
      const sets = await tx.table('workoutSets').toArray() as WorkoutSet[];
      for (const set of sets) {
        await tx.table('workoutSets').put({
          ...set,
          setKind: set.setKind || 'working',
          durationSeconds: set.durationSeconds ?? (set.duration !== undefined ? Math.round(set.duration * 60) : undefined),
          distanceMeters: set.distanceMeters ?? (set.distance !== undefined ? Math.round(set.distance * 1000) : undefined)
        });
      }
    });
  }
}

export const db = new FitnessDB();

export async function initDB() {
  const defaultExercises: Exercise[] = [
      // 胸部 (Chest)
      { name: '杠铃平板卧推', muscleGroup: '胸部', description: '肩胛骨收紧，将杠铃推起至手臂伸直。' },
      { name: '哑铃平板卧推', muscleGroup: '胸部', description: '相比杠铃能提供更大的运动幅度。' },
      { name: '上斜杠铃卧推', muscleGroup: '胸部', description: '重点刺激胸肌上束。' },
      { name: '上斜哑铃卧推', muscleGroup: '胸部', description: '重点刺激胸肌上束，运动幅度大。' },
      { name: '哑铃飞鸟', muscleGroup: '胸部', description: '保持手肘微曲，感受胸肌拉伸。' },
      { name: '绳索夹胸', muscleGroup: '胸部', description: '感受胸肌的顶峰收缩。' },
      { name: '蝴蝶机夹胸', muscleGroup: '胸部', description: '固定器械，适合孤立刺激胸肌。' },
      { name: '俯卧撑', muscleGroup: '胸部/三头', description: '自重基础动作，保持核心收紧。' },

      // 背部 (Back)
      { name: '引体向上', muscleGroup: '背部', description: '利用背部肌肉拉起身体，下巴过杠。' },
      { name: '杠铃划船', muscleGroup: '背部', description: '保持背部平直，将杠铃拉至下腹部。' },
      { name: '高位下拉', muscleGroup: '背部', description: '重点刺激背阔肌，挺胸沉肩。' },
      { name: '坐姿划船', muscleGroup: '背部', description: '器械划船，感受肩胛骨的后收。' },
      { name: '哑铃单臂划船', muscleGroup: '背部', description: '单侧动作，能更好感受背部发力。' },
      { name: '直臂下压', muscleGroup: '背部', description: '孤立刺激背阔肌，保持手臂微屈。' },
      { name: '硬拉 (传统)', muscleGroup: '背部/腿部', description: '核心收紧，利用臀腿力量拉起杠铃。' },

      // 腿部/臀部 (Legs & Glutes)
      { name: '杠铃深蹲 (高杠)', muscleGroup: '腿部', description: '保持背部挺直，下蹲至大腿与地面平行或更低。' },
      { name: '杠铃深蹲 (低杠)', muscleGroup: '腿部', description: '杠铃放于肩胛骨后侧，更多利用臀部力量。' },
      { name: '罗马尼亚硬拉 (RDL)', muscleGroup: '腿部/臀部', description: '微屈膝，髋部后推，感受大腿后侧拉伸。' },
      { name: '保加利亚分腿蹲', muscleGroup: '腿部/臀部', description: '后脚垫高，重心放在前腿，深蹲至前腿大腿平行地面。' },
      { name: '腿举 (Leg Press)', muscleGroup: '腿部', description: '固定器械，脚踩在踏板上蹬起重量。' },
      { name: '坐姿腿屈伸', muscleGroup: '腿部', description: '孤立刺激大腿前侧（股四头肌）。' },
      { name: '俯卧腿弯举', muscleGroup: '腿部', description: '孤立刺激大腿后侧（腘绳肌）。' },
      { name: '臀推 (Hip Thrust)', muscleGroup: '臀部', description: '背靠卧推凳，用臀部力量顶起杠铃。' },
      { name: '站姿提踵', muscleGroup: '小腿', description: '收缩腓肠肌，提起脚后跟。' },

      // 肩部 (Shoulders)
      { name: '杠铃推举 (OHP)', muscleGroup: '肩部', description: '站姿，将杠铃从锁骨上方推至头顶。' },
      { name: '坐姿哑铃推举', muscleGroup: '肩部', description: '核心收紧，将哑铃向上推举，手肘微靠前。' },
      { name: '哑铃侧平举', muscleGroup: '肩部', description: '孤立刺激三角肌中束，手臂微屈，举至与肩同高。' },
      { name: '绳索面拉 (Face Pull)', muscleGroup: '肩部/背部', description: '刺激三角肌后束，将绳索拉向面部。' },
      { name: '反向飞鸟', muscleGroup: '肩部', description: '俯身或使用器械，刺激三角肌后束。' },

      // 手臂 (Arms)
      { name: '杠铃弯举', muscleGroup: '手臂', description: '双手握杠铃，大臂固定，发力弯举。' },
      { name: '哑铃交替弯举', muscleGroup: '手臂', description: '大臂夹紧，交替弯举哑铃。' },
      { name: '锤式弯举', muscleGroup: '手臂', description: '掌心相对握持哑铃，侧重肱肌。' },
      { name: '绳索下压 (三头)', muscleGroup: '手臂', description: '大臂固定，发力向下压绳索。' },
      { name: '过头臂屈伸', muscleGroup: '手臂', description: '双手握哑铃于头顶，向上伸直手臂，侧重三头肌长头。' },
      { name: '仰卧臂屈伸 (碎颅者)', muscleGroup: '手臂', description: '仰卧，使用曲杆杠铃进行臂屈伸。' },

      // 核心 (Core)
      { name: '卷腹', muscleGroup: '核心', description: '平躺，下背部贴地，依靠腹肌收缩使上半身微抬。' },
      { name: '平板支撑', muscleGroup: '核心', description: '保持身体呈一条直线，核心收紧。' },
      { name: '悬垂举腿', muscleGroup: '核心', description: '双手悬挂单杠，依靠腹肌力量将双腿向上抬起。' },
      { name: '俄罗斯转体', muscleGroup: '核心', description: '坐姿，双脚离地，上半身左右转动。' },
      // 兼容旧版本的名称
      { name: '杠铃深蹲', muscleGroup: '腿部', description: '保持背部挺直，下蹲至大腿与地面平行。' },
      { name: '杠铃卧推', muscleGroup: '胸部', description: '肩胛骨收紧，将杠铃推起至手臂伸直。' },
      { name: '硬拉', muscleGroup: '背部/腿部', description: '核心收紧，利用臀腿力量拉起杠铃。' },
      { name: '哑铃推举', muscleGroup: '肩部', description: '核心收紧，将哑铃向上推举。' },
      { name: '哑铃二头弯举', muscleGroup: '手臂', description: '大臂夹紧，只用小臂弯举哑铃。' },

      // 有氧心肺 (Cardio)
      { name: '跑步机跑步', muscleGroup: '有氧心肺', description: '在跑步机上进行定速或变速跑步。', type: 'cardio' },
      { name: '户外跑步', muscleGroup: '有氧心肺', description: '户外路跑，呼吸新鲜空气，感受路面反馈。', type: 'cardio' },
      { name: '动感单车', muscleGroup: '有氧心肺', description: '利用动感单车进行高强度间歇或稳定状态骑行。', type: 'cardio' },
      { name: '椭圆机', muscleGroup: '有氧心肺', description: '低冲击有氧运动，对手肘和膝关节非常友好。', type: 'cardio' },
      { name: '划船机', muscleGroup: '有氧心肺', description: '全身参与的有氧运动，对背部和腿部都有锻炼。', type: 'cardio' },
      { name: '爬楼机', muscleGroup: '有氧心肺', description: '模拟爬楼梯，对臀部和大腿肌肉有极强刺激。', type: 'cardio' },
      { name: '游泳', muscleGroup: '有氧心肺', description: '全身性有氧运动，低关节冲击，极好地锻炼心肺功能。', type: 'cardio' }
  ];

  const bodyweightExercises = new Set(['俯卧撑', '引体向上', '卷腹', '平板支撑', '悬垂举腿', '俄罗斯转体']);
  for (const exercise of defaultExercises) {
    if (exercise.type !== 'cardio') {
      exercise.loadType = bodyweightExercises.has(exercise.name) ? 'bodyweight-added' : 'external';
    }
    Object.assign(exercise, exerciseDefaults(exercise));
  }

  await db.transaction('rw', [db.exercises, db.userProfiles, db.supplements], async () => {
  const currentExercises = await db.exercises.toArray();
  const currentMap = new Map(currentExercises.map(e => [e.name, e]));
  
  const missingExercises: Exercise[] = [];
  const exercisesToUpdate: Exercise[] = [];

  for (const defEx of defaultExercises) {
    const existing = currentMap.get(defEx.name);
    if (!existing) {
      missingExercises.push(defEx);
    } else if (
      existing.type !== defEx.type ||
      existing.loadType !== defEx.loadType ||
      existing.recordingMode !== defEx.recordingMode ||
      existing.equipment !== defEx.equipment ||
      existing.movementPattern !== defEx.movementPattern
    ) {
      exercisesToUpdate.push({
        ...existing,
        type: defEx.type,
        loadType: defEx.loadType,
        ...exerciseDefaults(defEx)
      });
    }
  }
  
  if (missingExercises.length > 0) {
    await db.exercises.bulkAdd(missingExercises);
  }
  if (exercisesToUpdate.length > 0) {
    await db.exercises.bulkPut(exercisesToUpdate);
  }

  if (!await db.userProfiles.get('current')) {
    let savedProfile: Partial<UserProfile> = {};
    try {
      savedProfile = JSON.parse(localStorage.getItem('nutrition_profile') || '{}');
    } catch {
      // Ignore corrupt legacy settings and use safe defaults.
    }
    await db.userProfiles.put({
      id: 'current',
      gender: savedProfile.gender === 'female' ? 'female' : 'male',
      age: Number(savedProfile.age) || 25,
      height: Number(savedProfile.height) || 175,
      weight: Number(savedProfile.weight) || 70,
      activity: Number(savedProfile.activity) || 1.2,
      goal: ['cut', 'maintain', 'bulk'].includes(String(savedProfile.goal))
        ? savedProfile.goal as UserProfile['goal']
        : 'maintain'
    });
  }
  const canonicalProfile = await db.userProfiles.get('current');
  if (canonicalProfile) localStorage.setItem('nutrition_profile', JSON.stringify(canonicalProfile));

  if (await db.supplements.count() === 0) {
    await db.supplements.bulkAdd([{ name: '肌酸' }, { name: '蛋白粉' }, { name: '复合维生素' }]);
  }
  });
}
