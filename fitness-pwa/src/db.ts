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
  techniqueCues?: string[]; // 动作标准发力要领与避坑提示
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

export function isCardioExercise(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'type' | 'recordingMode'> | undefined): boolean {
  if (!exercise) return false;
  const name = exercise.name || '';
  if (name.includes('波比')) return false; // 波比跳为全身高强度自重计数动作
  if (exercise.type === 'cardio') return true;
  if (exercise.muscleGroup?.includes('有氧')) return true;
  if (['distance_time', 'time_level', 'swim', 'interval'].includes(exercise.recordingMode || '')) return true;
  const cardioKeywords = ['跑步', '慢跑', '散步', '走步', '单车', '骑行', '椭圆机', '划船机', '爬楼机', '跳绳', '战绳', '游泳', '开合跳', '健步走'];
  return cardioKeywords.some(k => name.includes(k));
}

export function isTimedHoldExercise(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'type' | 'recordingMode'> | undefined): boolean {
  if (!exercise) return false;
  if (isCardioExercise(exercise)) return false;

  const name = exercise.name || '';

  // 严格优先排除所有计数动作关键词（悬垂举腿、悬垂提膝、波比跳等绝不可被误判为计时）
  if (
    name.includes('举腿') || name.includes('提膝') || name.includes('抬腿') ||
    name.includes('波比') || name.includes('转体') || name.includes('卷腹') ||
    name.includes('深蹲') || name.includes('卧推') || name.includes('划船') ||
    name.includes('推举') || name.includes('硬拉') || name.includes('弯举') ||
    name.includes('臂屈伸') || name.includes('飞鸟') || name.includes('下拉') ||
    name.includes('夹胸') || name.includes('提踵') || name.includes('健腹轮') ||
    name.includes('死虫')
  ) {
    return false;
  }

  if (exercise.recordingMode === 'timed_hold') return true;
  if (exercise.recordingMode) return false;

  // 真正属于静态保持时长的动作关键字
  const timedKeywords = [
    '平板支撑', '侧平板', '侧支撑', '静蹲', '靠墙静蹲',
    '静态悬垂', '单杠悬垂', '悬垂保持', '死挂', '悬垂',
    '铁板桥', '静态倒立', '倒立保持', '拉伸保持', '静态保持', 'L坐保持'
  ];
  return timedKeywords.some(k => name.includes(k));
}

export function exerciseDefaults(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'type' | 'recordingMode'>): Partial<Exercise> {
  const { name, muscleGroup } = exercise;
  const isCardio = isCardioExercise(exercise);
  const isTimedHold = isTimedHoldExercise(exercise);
  const effectiveType: 'cardio' | 'strength' = isCardio ? 'cardio' : 'strength';
  const muscleParts = (muscleGroup || '全身').split('/');
  const fixedMachineNames = ['蝴蝶机', '腿举', '腿屈伸', '腿弯举', '坐姿划船', '器械', '哈克', '牧师凳'];
  const cardioEquipment: Record<string, string> = {
    跑步机跑步: '跑步机',
    户外跑步: '户外',
    动感单车: '动感单车',
    椭圆机: '椭圆机',
    划船机: '划船机',
    爬楼机: '爬楼机',
    游泳: '泳池',
    跳绳: '跳绳',
    战绳: '战绳'
  };
  const base: Partial<Exercise> = {
    type: effectiveType,
    primaryMuscles: [muscleParts[0]],
    secondaryMuscles: muscleParts.slice(1),
    weightInputMode: 'total',
    implementCount: 1,
    bodyweightFactor: 1,
    countInVolume: !isCardio && !isTimedHold,
    equipment: isCardio
      ? cardioEquipment[name] || '有氧器械'
      : name.includes('哑铃')
        ? '哑铃'
        : name.includes('杠铃') || name.includes('硬拉') || name.includes('T杠')
          ? '杠铃'
          : name.includes('绳索') || name.includes('下拉') || name.includes('面拉')
            ? '绳索器械'
            : fixedMachineNames.some(keyword => name.includes(keyword))
              ? '固定器械'
              : '自重/通用',
    movementPattern: name.includes('卧推') || name.includes('俯卧撑') || name.includes('推胸')
      ? '水平推'
      : name.includes('划船')
        ? '水平拉'
        : name.includes('引体') || name.includes('下拉')
          ? '垂直拉'
          : name.includes('推举') || name.includes('阿诺德')
            ? '垂直推'
            : name.includes('深蹲') || name.includes('腿举') || name.includes('箭步')
              ? '蹲'
              : name.includes('硬拉') || name.includes('臀推')
                ? '髋主导'
                : isCardio
                  ? '有氧'
                  : muscleParts[0]
  };

  if (isCardio) {
    if (name.includes('游泳')) return { ...base, recordingMode: 'swim', countInVolume: false, supports1RM: false };
    if (name.includes('椭圆机') || name.includes('爬楼机')) return { ...base, recordingMode: 'time_level', countInVolume: false, supports1RM: false };
    return { ...base, recordingMode: 'distance_time', countInVolume: false, supports1RM: false };
  }

  if (isTimedHold) {
    return {
      ...base,
      recordingMode: 'timed_hold',
      loadType: 'bodyweight-added',
      countInVolume: false,
      supports1RM: false
    };
  }

  const bodyweightCountExercises = [
    '俯卧撑', '引体向上', '双杠臂屈伸', '卷腹', '悬垂举腿', '悬垂提膝', '俄罗斯转体', '健腹轮', '死虫式', '波比跳'
  ];
  if (bodyweightCountExercises.some(k => name.includes(k))) {
    const isUpperBodyweight = name.includes('引体') || name.includes('双杠');
    return {
      ...base,
      recordingMode: 'bodyweight_reps',
      loadType: 'bodyweight-added',
      bodyweightFactor: name.includes('俯卧撑') ? 0.65 : 1,
      countInVolume: true,
      supports1RM: isUpperBodyweight
    };
  }

  const isDumbbell = name.includes('哑铃') && name !== '过头臂屈伸' && !name.includes('飞鸟');
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
    // 胸部 (Chest) - 原有动作 + 经典高效补充（不超过3个）
    { name: '杠铃平板卧推', muscleGroup: '胸部', description: '肩胛骨收紧，将杠铃推起至手臂伸直。' },
    { name: '哑铃平板卧推', muscleGroup: '胸部', description: '相比杠铃能提供更大的运动幅度。' },
    { name: '上斜杠铃卧推', muscleGroup: '胸部', description: '重点刺激胸肌上束。' },
    { name: '上斜哑铃卧推', muscleGroup: '胸部', description: '重点刺激胸肌上束，运动幅度大。' },
    { name: '哑铃飞鸟', muscleGroup: '胸部', description: '保持手肘微曲，感受胸肌拉伸。' },
    { name: '绳索夹胸', muscleGroup: '胸部', description: '感受胸肌的顶峰收缩。' },
    { name: '蝴蝶机夹胸', muscleGroup: '胸部', description: '固定器械，适合孤立刺激胸肌。' },
    { name: '俯卧撑', muscleGroup: '胸部/三头', description: '自重基础动作，保持核心收紧。' },
    { name: '双杠臂屈伸 (Dips)', muscleGroup: '胸部/三头', description: '身体微前倾，重点刺激胸大肌下缘与肱三头肌。' },
    { name: '器械推胸', muscleGroup: '胸部', description: '固定器械推胸，安全稳定，适合大重量力竭或找胸肌发力感。' },
    { name: '下斜哑铃卧推', muscleGroup: '胸部', description: '长凳下倾 15-30 度，精准雕刻胸肌下缘与外侧轮廓。' },

    // 背部 (Back) - 原有动作 + 经典高效补充（不超过3个）
    { name: '引体向上', muscleGroup: '背部', description: '利用背部肌肉拉起身体，下巴过杠。' },
    { name: '杠铃划船', muscleGroup: '背部', description: '保持背部平直，将杠铃拉至下腹部。' },
    { name: '高位下拉', muscleGroup: '背部', description: '重点刺激背阔肌，挺胸沉肩。' },
    { name: '坐姿划船', muscleGroup: '背部', description: '器械划船，感受肩胛骨的后收。' },
    { name: '哑铃单臂划船', muscleGroup: '背部', description: '单侧动作，能更好感受背部发力。' },
    { name: '直臂下压', muscleGroup: '背部', description: '孤立刺激背阔肌，保持手臂微屈。' },
    { name: '硬拉 (传统)', muscleGroup: '背部/腿部', description: '核心收紧，利用臀腿力量拉起杠铃。' },
    { name: 'T杠划船', muscleGroup: '背部', description: '强化背部厚度与上背肌群，核心收紧保持脊柱刚性。' },
    { name: '窄握绳索划船', muscleGroup: '背部', description: '对握手柄拉至腹部，最大化背阔肌中下部收缩。' },
    { name: '静态悬垂 (死挂)', muscleGroup: '背部/肩部', description: '双手悬挂单杠放松脊柱，增强握力与肩关节稳定性。' },

    // 腿部/臀部 (Legs & Glutes) - 原有动作 + 经典高效补充（不超过3个）
    { name: '杠铃深蹲 (高杠)', muscleGroup: '腿部', description: '保持背部挺直，下蹲至大腿与地面平行或更低。' },
    { name: '杠铃深蹲 (低杠)', muscleGroup: '腿部', description: '杠铃放于肩胛骨后侧，更多利用臀部力量。' },
    { name: '罗马尼亚硬拉 (RDL)', muscleGroup: '腿部/臀部', description: '微屈膝，髋部后推，感受大腿后侧拉伸。' },
    { name: '保加利亚分腿蹲', muscleGroup: '腿部/臀部', description: '后脚垫高，重心放在前腿，深蹲至前腿大腿平行地面。' },
    { name: '腿举 (Leg Press)', muscleGroup: '腿部', description: '固定器械，脚踩在踏板上蹬起重量。' },
    { name: '坐姿腿屈伸', muscleGroup: '腿部', description: '孤立刺激大腿前侧（股四头肌）。' },
    { name: '俯卧腿弯举', muscleGroup: '腿部', description: '孤立刺激大腿后侧（腘绳肌）。' },
    { name: '臀推 (Hip Thrust)', muscleGroup: '臀部', description: '背靠卧推凳，用臀部力量顶起杠铃。' },
    { name: '站姿提踵', muscleGroup: '小腿', description: '收缩腓肠肌，提起脚后跟。' },
    { name: '哑铃箭步蹲', muscleGroup: '腿部/臀部', description: '单腿交替向前或原地跨步，兼顾臀腿力量与核心平衡。' },
    { name: '哈克深蹲', muscleGroup: '腿部', description: '固定器械稳定支撑脊柱，孤立轰炸股四头肌。' },
    { name: '靠墙静蹲', muscleGroup: '腿部', description: '背靠墙壁屈膝 90 度静止保持，强化股四头肌耐力并养护膝盖。' },

    // 肩部 (Shoulders) - 原有动作 + 经典高效补充（不超过3个）
    { name: '杠铃推举 (OHP)', muscleGroup: '肩部', description: '站姿，将杠铃从锁骨上方推至头顶。' },
    { name: '坐姿哑铃推举', muscleGroup: '肩部', description: '核心收紧，将哑铃向上推举，手肘微靠前。' },
    { name: '哑铃侧平举', muscleGroup: '肩部', description: '孤立刺激三角肌中束，手臂微屈，举至与肩同高。' },
    { name: '绳索面拉 (Face Pull)', muscleGroup: '肩部/背部', description: '刺激三角肌后束，将绳索拉向面部。' },
    { name: '反向飞鸟', muscleGroup: '肩部', description: '俯身或使用器械，刺激三角肌后束。' },
    { name: '阿诺德推举', muscleGroup: '肩部', description: '哑铃旋转推举，全方位激活三角肌前束与中束。' },
    { name: '绳索侧平举', muscleGroup: '肩部', description: '低位滑轮全程恒定张力孤立三角肌中束，消除重力盲区。' },
    { name: '俯身哑铃飞鸟', muscleGroup: '肩部', description: '俯身微屈膝，手肘向外上方展开，精准刺激三角肌后束。' },

    // 手臂 (Arms) - 原有动作 + 经典高效补充（不超过3个）
    { name: '杠铃弯举', muscleGroup: '手臂', description: '双手握杠铃，大臂固定，发力弯举。' },
    { name: '哑铃交替弯举', muscleGroup: '手臂', description: '大臂夹紧，交替弯举哑铃。' },
    { name: '锤式弯举', muscleGroup: '手臂', description: '掌心相对握持哑铃，侧重肱肌。' },
    { name: '绳索下压 (三头)', muscleGroup: '手臂', description: '大臂固定，发力向下压绳索。' },
    { name: '过头臂屈伸', muscleGroup: '手臂', description: '双手握哑铃于头顶，向上伸直手臂，侧重三头肌长头。' },
    { name: '仰卧臂屈伸 (碎颅者)', muscleGroup: '手臂', description: '仰卧，使用曲杆杠铃进行臂屈伸。' },
    { name: '牧师凳弯举', muscleGroup: '手臂', description: '上臂固定在斜板上，完全消除借力，孤立二头肌短头与肌峰。' },
    { name: '绳索过头臂屈伸', muscleGroup: '手臂', description: '低位绳索向头顶上方伸直手臂，深层拉伸肱三头肌长头。' },
    { name: '窄距杠铃卧推', muscleGroup: '手臂/胸部', description: '窄握杠铃（与肩同宽），大重量复合轰炸肱三头肌。' },

    // 核心 (Core) - 原有动作 + 经典高效补充（不超过3个）
    { name: '卷腹', muscleGroup: '核心', description: '平躺，下背部贴地，依靠腹肌收缩使上半身微抬。' },
    { name: '平板支撑', muscleGroup: '核心', description: '保持身体呈一条直线，核心收紧。' },
    { name: '悬垂举腿', muscleGroup: '核心', description: '双手悬挂单杠，依靠腹肌力量将双腿向上抬起。' },
    { name: '俄罗斯转体', muscleGroup: '核心', description: '坐姿，双脚离地，上半身左右转动。' },
    { name: '健腹轮', muscleGroup: '核心', description: '跪姿手推健腹轮向前伸展，极强抗伸展刺激整个腹直肌。' },
    { name: '死虫式', muscleGroup: '核心', description: '仰卧对角线手脚延伸，下背死死贴地，强化深层核心与骨盆稳定。' },
    { name: '侧平板支撑', muscleGroup: '核心', description: '单臂与脚侧支撑身体呈直线，强化腹内外斜肌与侧向核心抗侧屈能力。' },

    // 兼容旧版本的名称
    { name: '杠铃深蹲', muscleGroup: '腿部', description: '保持背部挺直，下蹲至大腿与地面平行。' },
    { name: '杠铃卧推', muscleGroup: '胸部', description: '肩胛骨收紧，将杠铃推起至手臂伸直。' },
    { name: '硬拉', muscleGroup: '背部/腿部', description: '核心收紧，利用臀腿力量拉起杠铃。' },
    { name: '哑铃推举', muscleGroup: '肩部', description: '核心收紧，将哑铃向上推举。' },
    { name: '哑铃二头弯举', muscleGroup: '手臂', description: '大臂夹紧，只用小臂弯举哑铃。' },

    // 有氧心肺 (Cardio) - 原有动作 + 经典高效补充（不超过3个）
    { name: '跑步机跑步', muscleGroup: '有氧心肺', description: '在跑步机上进行定速或变速跑步。', type: 'cardio' },
    { name: '户外跑步', muscleGroup: '有氧心肺', description: '户外路跑，呼吸新鲜空气，感受路面反馈。', type: 'cardio' },
    { name: '动感单车', muscleGroup: '有氧心肺', description: '利用动感单车进行高强度间歇或稳定状态骑行。', type: 'cardio' },
    { name: '椭圆机', muscleGroup: '有氧心肺', description: '低冲击有氧运动，对手肘和膝关节非常友好。', type: 'cardio' },
    { name: '划船机', muscleGroup: '有氧心肺', description: '全身参与的有氧运动，对背部和腿部都有锻炼。', type: 'cardio' },
    { name: '爬楼机', muscleGroup: '有氧心肺', description: '模拟爬楼梯，对臀部和大腿肌肉有极强刺激。', type: 'cardio' },
    { name: '游泳', muscleGroup: '有氧心肺', description: '全身性有氧运动，低关节冲击，极好地锻炼心肺功能。', type: 'cardio' },
    { name: '跳绳', muscleGroup: '有氧心肺', description: '高效燃脂与心肺训练，提升下肢敏捷性与弹跳耐力。', type: 'cardio' },
    { name: '战绳', muscleGroup: '有氧心肺', description: '双手交替甩动战绳，极强的心肺耐力与上肢爆发力轰炸。', type: 'cardio' },
    { name: '波比跳', muscleGroup: '全身/核心', description: '下蹲、后踢腿、俯卧撑再跃起，全身高强度自重燃脂动作。' }
  ];

  const bodyweightExercises = new Set([
    '俯卧撑', '引体向上', '双杠臂屈伸', '双杠臂屈伸 (Dips)', '卷腹',
    '平板支撑', '侧平板支撑', '悬垂举腿', '悬垂提膝', '俄罗斯转体',
    '健腹轮', '死虫式', '靠墙静蹲', '静态悬垂 (死挂)', '静态悬垂', '单杠悬垂', '波比跳'
  ]);
  for (const exercise of defaultExercises) {
    if (exercise.type !== 'cardio') {
      exercise.loadType = bodyweightExercises.has(exercise.name) ? 'bodyweight-added' : 'external';
    }
    Object.assign(exercise, exerciseDefaults(exercise));
  }

  await db.transaction('rw', [db.exercises, db.workoutTemplates, db.workoutSets, db.userProfiles, db.supplements], async () => {
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

    // 全量动作校验：确保所有系统预设动作（含历史遗留动作）的 recordingMode 与 type 100% 准确
    for (const ex of currentExercises) {
      if (ex.isCustom) continue; // 自定义动作由用户显式配置与编辑，保留用户的个性化设置
      if (exercisesToUpdate.some(u => u.id === ex.id)) continue;
      const isCardio = isCardioExercise(ex);
      const isTimed = isTimedHoldExercise(ex);
      let shouldUpdate = false;
      const updated = { ...ex };

      if (isCardio) {
        if (updated.type !== 'cardio') {
          updated.type = 'cardio';
          shouldUpdate = true;
        }
        if (!['distance_time', 'time_level', 'swim', 'interval'].includes(updated.recordingMode || '')) {
          Object.assign(updated, exerciseDefaults(updated));
          shouldUpdate = true;
        }
      } else if (isTimed) {
        if (updated.recordingMode !== 'timed_hold' || updated.type !== 'strength') {
          updated.type = 'strength';
          updated.recordingMode = 'timed_hold';
          updated.loadType = 'bodyweight-added';
          updated.countInVolume = false;
          updated.supports1RM = false;
          shouldUpdate = true;
        }
      } else {
        // 计数类动作（绝对不能是 timed_hold 或 cardio，修复例如悬垂举腿被误置为 timed_hold 的情况）
        if (updated.recordingMode === 'timed_hold' || updated.type === 'cardio') {
          updated.type = 'strength';
          Object.assign(updated, exerciseDefaults(updated));
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        exercisesToUpdate.push(updated);
      }
    }
      
    if (missingExercises.length > 0) {
      await db.exercises.bulkAdd(missingExercises);
    }
    if (exercisesToUpdate.length > 0) {
      await db.exercises.bulkPut(exercisesToUpdate);
    }

    // 构建最新动作映射表，用于核对并纠偏历史记录与计划模板
    const allLatestExercises = await db.exercises.toArray();
    const exMap = new Map<number, Exercise>();
    for (const ex of allLatestExercises) {
      if (ex.id) exMap.set(ex.id, ex);
    }

    // 历史训练组数据清洗：核对记录格式，该计时的计时，该计数的计数
    const allSets = await db.workoutSets.toArray();
    const setsToUpdate: WorkoutSet[] = [];

    for (const set of allSets) {
      const ex = exMap.get(set.exerciseId);
      if (!ex) continue;

      const isCardio = isCardioExercise(ex);
      const isTimed = isTimedHoldExercise(ex);
      let setChanged = false;
      const updatedSet: WorkoutSet = { ...set };

      if (isCardio) {
        // 有氧类：reps 与 weight 置零，保留时长秒与距离米
        if (updatedSet.reps !== 0) {
          updatedSet.reps = 0;
          setChanged = true;
        }
        if (updatedSet.weight !== 0) {
          updatedSet.weight = 0;
          setChanged = true;
        }
        if (updatedSet.durationSeconds === undefined && updatedSet.duration !== undefined) {
          updatedSet.durationSeconds = Math.round(updatedSet.duration * 60);
          setChanged = true;
        }
        if (updatedSet.distanceMeters === undefined && updatedSet.distance !== undefined) {
          updatedSet.distanceMeters = Math.round(updatedSet.distance * 1000);
          setChanged = true;
        }
      } else if (isTimed) {
        // 纯静态时长动作（如平板支撑、侧平板、靠墙静蹲、静态悬垂）：必须有 durationSeconds，reps 规范为 1
        if (updatedSet.durationSeconds === undefined || updatedSet.durationSeconds <= 0) {
          if (updatedSet.duration !== undefined && updatedSet.duration > 0) {
            updatedSet.durationSeconds = Math.round(updatedSet.duration * 60);
          } else if (updatedSet.reps && updatedSet.reps > 1) {
            updatedSet.durationSeconds = updatedSet.reps >= 15 ? updatedSet.reps : 60;
          } else {
            updatedSet.durationSeconds = 60;
          }
          setChanged = true;
        }
        if (updatedSet.reps !== 1) {
          updatedSet.reps = 1;
          setChanged = true;
        }
        if (updatedSet.durationSeconds && updatedSet.duration === undefined) {
          updatedSet.duration = Math.round((updatedSet.durationSeconds / 60) * 10) / 10;
          setChanged = true;
        }
      } else {
        // 计数类动作（力量动作、悬垂举腿、自重动作等）：绝不含 durationSeconds 或 duration，修复被误记为 1 次与时长
        if (updatedSet.durationSeconds !== undefined || updatedSet.duration !== undefined) {
          if (updatedSet.reps <= 1) {
            if (updatedSet.durationSeconds && updatedSet.durationSeconds >= 2 && updatedSet.durationSeconds <= 35) {
              // 用户在时长输入框中实际录入的是组次数（如 10、12、15 次）
              updatedSet.reps = updatedSet.durationSeconds;
            } else {
              // 默认秒数（如 60 秒）恢复为标准组默认次数 12 次
              updatedSet.reps = 12;
            }
          }
          delete updatedSet.durationSeconds;
          delete updatedSet.duration;
          setChanged = true;
        }
        if (updatedSet.reps === undefined || updatedSet.reps <= 0) {
          updatedSet.reps = 10;
          setChanged = true;
        }
      }

      if (setChanged) {
        setsToUpdate.push(updatedSet);
      }
    }

    if (setsToUpdate.length > 0) {
      await db.workoutSets.bulkPut(setsToUpdate);
    }

    // 计划模板数据清洗：清理计数动作的 targetDurationSeconds，补充时长动作的 targetDurationSeconds
    const allTemplates = await db.workoutTemplates.toArray();
    const templatesToUpdate: WorkoutTemplate[] = [];

    for (const template of allTemplates) {
      if (!template.exercises) continue;
      let tplChanged = false;
      const updatedPlanned = template.exercises.map(plan => {
        const ex = exMap.get(plan.exerciseId);
        if (!ex) return plan;
        const isCardio = isCardioExercise(ex);
        const isTimed = isTimedHoldExercise(ex);
        const copy = { ...plan };

        if (!isCardio && !isTimed) {
          // 计数动作：清理 targetDurationSeconds，确保 minReps/maxReps 有效
          if (copy.targetDurationSeconds !== undefined) {
            delete copy.targetDurationSeconds;
            tplChanged = true;
          }
          if (!copy.minReps || copy.minReps <= 1) {
            copy.minReps = 8;
            tplChanged = true;
          }
          if (!copy.maxReps || copy.maxReps <= 1) {
            copy.maxReps = 12;
            tplChanged = true;
          }
        } else if (isTimed) {
          // 时长动作：确保 targetDurationSeconds
          if (!copy.targetDurationSeconds) {
            copy.targetDurationSeconds = 60;
            tplChanged = true;
          }
          if (copy.minReps !== 1 || copy.maxReps !== 1) {
            copy.minReps = 1;
            copy.maxReps = 1;
            tplChanged = true;
          }
        }
        return copy;
      });

      if (tplChanged) {
        templatesToUpdate.push({ ...template, exercises: updatedPlanned });
      }
    }

    if (templatesToUpdate.length > 0) {
      await db.workoutTemplates.bulkPut(templatesToUpdate);
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
