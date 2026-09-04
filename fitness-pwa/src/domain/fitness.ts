import type { Exercise, PlannedExercise, WorkoutSet, UserProfile } from '../db';

export function effectiveLoad(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  const entered = Math.max(0, Number(set.weight) || 0);
  const externalMultiplier = exercise?.weightInputMode === 'per_implement' ? Math.max(1, exercise.implementCount || 1) : 1;
  const externalLoad = entered * externalMultiplier;
  const bodyweightLoad = bodyWeight * (exercise?.bodyweightFactor ?? 1);
  switch (set.loadType || exercise?.loadType) {
    case 'bodyweight': return bodyweightLoad;
    case 'bodyweight-added': return bodyweightLoad + externalLoad;
    case 'assisted': return Math.max(0, bodyweightLoad - entered);
    default: return externalLoad;
  }
}

export function setVolume(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  if (exercise?.type === 'cardio' || exercise?.countInVolume === false || (set.setKind && set.setKind !== 'working' && set.setKind !== 'drop' && set.setKind !== 'failure')) return 0;
  return effectiveLoad(set, exercise, bodyWeight) * Math.max(0, set.reps);
}

export function estimatedOneRepMax(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  if (exercise?.supports1RM === false || (set.setKind && set.setKind !== 'working') || set.reps < 1 || set.reps > 12) return null;
  const load = effectiveLoad(set, exercise, bodyWeight);
  return set.reps === 1 ? load : load * (1 + set.reps / 30);
}

export function getDurationSeconds(set: WorkoutSet) {
  return set.durationSeconds ?? Math.round((set.duration || 0) * 60);
}

export function getDistanceMeters(set: WorkoutSet) {
  return set.distanceMeters ?? Math.round((set.distance || 0) * 1000);
}

export function paceSecondsPerKm(set: WorkoutSet) {
  const duration = getDurationSeconds(set);
  const distance = getDistanceMeters(set);
  return duration > 0 && distance > 0 ? duration / (distance / 1000) : null;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatPace(secondsPerKm: number | null) {
  return secondsPerKm === null ? '--' : `${formatDuration(secondsPerKm)}/km`;
}

export function formatRecordedSet(set: WorkoutSet, exercise: Exercise | undefined) {
  const mode = exercise?.recordingMode || (exercise?.type === 'cardio' ? 'distance_time' : 'weight_reps');
  if (mode === 'timed_hold') return `${formatDuration(getDurationSeconds(set))} · ${set.weight > 0 ? `负重 ${set.weight} kg` : '自重'}`;
  if (mode === 'distance_time' || mode === 'swim') {
    const distance = getDistanceMeters(set);
    const details = [`${(distance / 1000).toFixed(distance % 1000 === 0 ? 1 : 2)} km`, formatDuration(getDurationSeconds(set)), formatPace(paceSecondsPerKm(set))];
    if (mode === 'swim' && set.swimStroke) details.push(set.swimStroke);
    if (set.heartRate) details.push(`${set.heartRate} bpm`);
    return details.join(' · ');
  }
  if (mode === 'time_level') return `${formatDuration(getDurationSeconds(set))} · 等级 ${set.level || 0}${set.heartRate ? ` · ${set.heartRate} bpm` : ''}`;
  if (mode === 'interval') return `${set.workSeconds || 0}s/${set.recoverySeconds || 0}s × ${set.intervals || 0}轮`;
  const loadType = set.loadType || exercise?.loadType;
  const load = loadType === 'assisted'
    ? `辅助 ${set.weight} kg`
    : loadType === 'bodyweight-added'
      ? (set.weight > 0 ? `自重 + ${set.weight} kg` : '自重')
      : exercise?.weightInputMode === 'per_implement'
        ? `每只 ${set.weight} kg`
        : `${set.weight} kg`;
  return `${load} × ${set.reps}${exercise?.weightInputMode === 'per_implement' ? '次/侧' : '次'}`;
}

export const SET_KIND_LABELS: Record<NonNullable<WorkoutSet['setKind']>, string> = {
  warmup: '热身', working: '工作', drop: '递减', failure: '力竭'
};

export function setMeetsPlan(set: WorkoutSet, plan: PlannedExercise, exercise: Exercise | undefined) {
  if (set.setKind === 'warmup') return false;
  const mode = exercise?.recordingMode || (exercise?.type === 'cardio' ? 'distance_time' : 'weight_reps');
  if (mode === 'weight_reps' || mode === 'bodyweight_reps') {
    const repsOk = set.reps >= plan.minReps;
    const weightOk = plan.targetWeight === undefined || set.weight >= plan.targetWeight;
    return repsOk && weightOk;
  }
  if (mode === 'timed_hold') return getDurationSeconds(set) >= (plan.targetDurationSeconds || 0);
  if (mode === 'distance_time' || mode === 'swim') {
    const hasDistTarget = (plan.targetDistanceMeters || 0) > 0;
    const hasDurTarget = (plan.targetDurationSeconds || 0) > 0;
    if (hasDistTarget && hasDurTarget) {
      return getDistanceMeters(set) >= plan.targetDistanceMeters! || getDurationSeconds(set) >= plan.targetDurationSeconds!;
    }
    if (hasDistTarget) return getDistanceMeters(set) >= plan.targetDistanceMeters!;
    if (hasDurTarget) return getDurationSeconds(set) >= plan.targetDurationSeconds!;
    return getDurationSeconds(set) > 0;
  }
  if (mode === 'time_level') {
    const durOk = getDurationSeconds(set) >= (plan.targetDurationSeconds || 0);
    const lvlOk = plan.targetLevel === undefined || (set.level || 0) >= plan.targetLevel;
    return durOk && lvlOk;
  }
  if (mode === 'interval') return (set.intervals || 0) > 0;
  return false;
}

export function exerciseMeetsPlan(
  sets: WorkoutSet[],
  plan: PlannedExercise,
  exercise: Exercise | undefined
): boolean {
  if (!sets || sets.length === 0) return false;
  const exSets = sets.filter(s => s.exerciseId === plan.exerciseId && (s.setKind || 'working') !== 'warmup');
  if (exSets.length === 0) return false;

  const mode = exercise?.recordingMode || (exercise?.type === 'cardio' ? 'distance_time' : 'weight_reps');

  // 条件 1: 达标单组的数量达到或超过目标组数（如目标 4 组，完成了 4 组或 6 组）
  const qualifyingSets = exSets.filter(s => setMeetsPlan(s, plan, exercise));
  if (qualifyingSets.length >= plan.targetSets) return true;

  // 条件 2: 实际完成的总训练量（次数/总时长/总距离）达到或超过计划预定总量
  if (mode === 'weight_reps' || mode === 'bodyweight_reps') {
    const totalPlannedReps = plan.targetSets * plan.minReps;
    const totalActualReps = exSets.reduce((sum, s) => {
      if (plan.targetWeight !== undefined && s.weight < plan.targetWeight) return sum;
      return sum + Math.max(0, s.reps);
    }, 0);
    if (totalActualReps >= totalPlannedReps) return true;
  }

  if (mode === 'timed_hold') {
    const totalPlannedSeconds = plan.targetSets * (plan.targetDurationSeconds || 0);
    const totalActualSeconds = exSets.reduce((sum, s) => sum + getDurationSeconds(s), 0);
    if (totalActualSeconds >= totalPlannedSeconds && totalPlannedSeconds > 0) return true;
  }

  if (mode === 'distance_time' || mode === 'swim') {
    if ((plan.targetDistanceMeters || 0) > 0) {
      const totalActualDist = exSets.reduce((sum, s) => sum + getDistanceMeters(s), 0);
      if (totalActualDist >= plan.targetDistanceMeters!) return true;
    }
    if ((plan.targetDurationSeconds || 0) > 0) {
      const totalActualDur = exSets.reduce((sum, s) => sum + getDurationSeconds(s), 0);
      if (totalActualDur >= plan.targetDurationSeconds!) return true;
    }
  }

  return false;
}

export function nutritionTargets(profile: UserProfile) {
  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.gender === 'male' ? 5 : -161);
  const tdee = Math.round(bmr * profile.activity);
  const defaultAdjustment = profile.goal === 'cut' ? -500 : profile.goal === 'bulk' ? 300 : 0;
  const calories = Math.max(1200, tdee + (profile.calorieAdjustment ?? defaultAdjustment));
  const protein = Math.round(profile.weight * 2);
  const fat = Math.round(profile.weight);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee, calories, protein, fat, carbs };
}

export function isValidProfile(profile: UserProfile) {
  return profile.age >= 13 && profile.age <= 100
    && profile.height >= 100 && profile.height <= 230
    && profile.weight >= 25 && profile.weight <= 350
    && profile.activity >= 1.2 && profile.activity <= 2;
}

export function allocateWholePortions(total: number, ratios = [0.25, 0.4, 0.35]) {
  const safeTotal = Math.max(0, Math.round(total));
  const raw = ratios.map(ratio => safeTotal * ratio);
  const result = raw.map(Math.floor);
  const remaining = safeTotal - result.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remaining; i += 1) result[order[i % order.length].index] += 1;
  return result;
}

export interface PlateCalculation {
  barWeight: number;
  perSideWeight: number;
  plates: { weight: number; count: number }[];
  remainder: number;
}

export function calculateBarbellPlates(
  totalWeight: number,
  barWeight = 20,
  availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25]
): PlateCalculation {
  const safeTotal = Math.max(0, Number(totalWeight) || 0);
  if (safeTotal <= barWeight) {
    return {
      barWeight,
      perSideWeight: 0,
      plates: [],
      remainder: Math.max(0, safeTotal - barWeight)
    };
  }

  const perSideTarget = (safeTotal - barWeight) / 2;
  let remaining = perSideTarget;
  const plates: { weight: number; count: number }[] = [];

  for (const plate of availablePlates) {
    if (remaining >= plate) {
      const count = Math.floor(remaining / plate);
      plates.push({ weight: plate, count });
      remaining = Number((remaining - count * plate).toFixed(2));
    }
  }

  return {
    barWeight,
    perSideWeight: perSideTarget,
    plates,
    remainder: remaining
  };
}

export function triggerRestEndAlert() {
  // 1. 手机物理震动 (两次短促震动)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([250, 120, 250]);
    } catch {
      // ignore
    }
  }

  // 2. Web Audio API 原生合成音（无需任何网络音频资源）
  if (typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1760, now + 0.12);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // Audio context might be restricted
    }
  }
}

export const DEFAULT_TECHNIQUE_CUES: Record<string, string[]> = {
  '杠铃平板卧推': [
    '沉肩收胛：肩胛骨向后收紧下沉，双脚踏实地面，胸腔主动向上挺起。',
    '手肘角度：手肘与躯干呈约 45°~60° 夹角，避免过度外展导致肩关节挤压。',
    '杠铃轨迹：杠铃下放轻触胸骨下缘/乳头连线，推起呈微弧线回到肩正上方。'
  ],
  '杠铃卧推': [
    '沉肩收胛：肩胛骨向后收紧下沉，双脚踏实地面，胸腔主动向上挺起。',
    '手肘角度：手肘与躯干呈约 45°~60° 夹角，避免过度外展导致肩关节挤压。',
    '杠铃轨迹：杠铃下放轻触胸骨下缘/乳头连线，推起呈微弧线回到肩正上方。'
  ],
  '哑铃平板卧推': [
    '双脚踩稳：沉肩收胛，小臂在整个推举过程中保持垂直地面。',
    '幅度充分：哑铃下放至胸大肌被充分拉伸，手掌略低于胸部水平线，切忌撞击哑铃。',
    '顶峰挤压：推至顶端时想象两肘向中间靠拢，维持胸肌持续张力。'
  ],
  '上斜杠铃卧推': [
    '椅背角度：建议调节在 30°~45°，角度过陡会导致前束过多代偿。',
    '发力轨迹：杠铃下放至锁骨下方（胸肌上束），推至眼睛或额头正上方。',
    '避免弓腰：下背微贴椅背，不要将上斜推举变相做成平板卧推。'
  ],
  '上斜哑铃卧推': [
    '椅背角度：建议调节在 30° 左右，精准刺激锁骨段（胸肌上束）。',
    '下放充分：下放至胸上部拉伸，手肘微内收，推起时在顶点微聚拢。',
    '手腕锁死：哑铃中心对准掌根，手腕保持中立位不后翻。'
  ],
  '哑铃飞鸟': [
    '肘部微屈：全程手肘保持微屈锁定，动作如“环抱大树”，不要做成卧推。',
    '拉伸优先：下放到胸肌有明显牵拉感即止，避免过深造成前肩韧带拉伤。',
    '控制离心：使用中轻重量，注重离心下放控制与向心顶峰挤压。'
  ],
  '绳索夹胸': [
    '躯干微倾：身体微向前倾，核心收紧，手肘保持固定微屈弧度。',
    '环抱发力：双手划圆弧向前下方交叉或靠拢，顶峰收缩挤压胸肌内侧 1 秒。',
    '慢速还原：有控制地匀速回放，感受胸肌被逐渐拉伸舒展。'
  ],
  '蝴蝶机夹胸': [
    '座椅高度：调节坐高使手柄或挡板高度与胸部中缝平齐。',
    '沉肩后靠：背部与后脑勺靠紧椅背，发力时切勿耸肩探颈。',
    '大臂内收：用意念引导手肘内侧与大臂向内挤压，而非手腕用力。'
  ],
  '俯卧撑': [
    '全身刚性：收紧核心、腹部与臀部，身体从头到脚呈一条笔直线。',
    '手部位置：双手稍宽于肩，手肘与躯干呈约 45 度夹角（箭头形）。',
    '下放充分：胸口贴近地面再推起，顶点将背部推满。'
  ],
  '引体向上': [
    '沉肩启动：悬垂位时先主动收紧肩胛骨下沉（激活背阔肌），再屈肘拉起。',
    '挺胸靠杠：尽量挺胸使锁骨靠近单杠，下巴自然过杠，避免缩脖借力。',
    '离心控制：下落时控制速度，不要脱力猛然坠落以保护肩关节。'
  ],
  '高位下拉': [
    '固定大腿：挡垫紧贴大腿上方，挺胸微后仰 10°~15°。',
    '引肘向下：想象“把手肘插进裤后兜”，不要用手腕死死往下拉。',
    '顶峰停顿：横杠拉至上胸锁骨位置停顿 0.5 秒，慢放至背部完全舒展。'
  ],
  '杠铃划船': [
    '屈髋俯身：微屈膝，髋关节向后推，躯干倾斜 45°~60°，背部平直紧绷。',
    '拉向肚脐：杠铃顺着大腿拉向肚脐至下腹部，手肘夹紧躯干两侧向后拉。',
    '避免借力：不要依靠腿部蹬直或身体上下大幅晃动借力拉起。'
  ],
  '坐姿划船': [
    '挺胸沉肩：双脚踏稳，膝盖微屈，上身保持直立不前后过度晃动。',
    '拉至下腹：手柄拉向肚脐部位，手肘紧贴肋骨向后拉，肩胛骨用力对挤。',
    '充分还原：还原时让肩胛骨自然向前展开，深度拉伸背阔肌。'
  ],
  '哑铃单臂划船': [
    '三点支撑：非工作侧手与膝盖支撑在长凳上，背部保持水平中立。',
    '弧线轨迹：哑铃从肩下方拉向同侧髋部，轨迹呈向后的自然弧线。',
    '躯干稳定：不要依靠旋转躯干借力，专注单侧背阔肌发力。'
  ],
  '直臂下压': [
    '微屈肘锁定：手臂微屈固定角度，屈髋微俯身，背部挺直。',
    '大弧线下压：利用背阔肌将横杠或绳索压至大腿前侧，挤压背阔肌下部。',
    '慢速回弹：高位时让双臂随绳索上升，充分体会背阔肌牵拉感。'
  ],
  '硬拉 (传统)': [
    '站位与杠铃：双脚与髋同宽，杠铃杆位于脚掌中心正上方（距离胫骨约2-3cm）。',
    '肩在杠前：俯身屈膝握杠，肩胛骨在杠铃正上方，手臂自然垂直如吊钩。',
    '伸髋蹬地：深吸气腹横肌收紧，双腿发力蹬地，杠铃贴着小腿胫骨垂直向上拉起，锁定后身体直立不后仰。'
  ],
  '硬拉': [
    '站位与杠铃：双脚与髋同宽，杠铃杆位于脚掌中心正上方（距离胫骨约2-3cm）。',
    '肩在杠前：俯身屈膝握杠，肩胛骨在杠铃正上方，手臂自然垂直如吊钩。',
    '伸髋蹬地：深吸气腹横肌收紧，双腿发力蹬地，杠铃贴着小腿胫骨垂直向上拉起，锁定后身体直立不后仰。'
  ],
  '罗马尼亚硬拉 (RDL)': [
    '屈膝固定：膝盖保持微屈角度全程不变化，动作纯粹由髋关节向后推主导。',
    '杠铃贴腿：杠铃下放时始终紧贴大腿表面向下滑动至膝盖下缘，不要远离身体。',
    '感受腘绳肌：下放至大腿后侧有强烈紧绷牵拉感，臀部发力向前顶收回。'
  ],
  '杠铃深蹲 (高杠)': [
    '杠铃位置：杠铃稳稳架在斜方肌上束，挺胸，手肘微向后收固定杠铃。',
    '下蹲轨迹：髋膝同时启动，膝盖顺着脚尖方向打开，保持脊柱刚性。',
    '全脚受力：脚掌三点（大脚趾球、小脚趾球、脚后跟）均匀压实地面，起立时不要内扣膝盖。'
  ],
  '杠铃深蹲': [
    '杠铃位置：杠铃稳稳架在斜方肌上束，挺胸，手肘微向后收固定杠铃。',
    '下蹲轨迹：髋膝同时启动，膝盖顺着脚尖方向打开，保持脊柱刚性。',
    '全脚受力：脚掌三点均匀压实地面，起立时不要内扣膝盖。'
  ],
  '杠铃深蹲 (低杠)': [
    '杠铃位置：杠铃置于三角肌后束与肩胛冈凹槽处，握距略宽。',
    '躯干前倾：相比高杠蹲，低杠蹲躯干前倾角度更大，更多由后链臀大肌参与。',
    '起立推髋：向上站起时想象臀部垂直向上顶起，保持核心高压刚性。'
  ],
  '保加利亚分腿蹲': [
    '步距适中：后脚脚背搭在卧推凳上，前脚往前迈一步使下蹲时前大腿基本平行地面。',
    '重心在前：约 85% 的体重放在前脚，后脚只负责平衡，膝盖对准第二脚趾。',
    '微前倾刺激臀：躯干微向前倾可增加臀大肌受力，躯干直立则更多刺激股四头肌。'
  ],
  '腿举 (Leg Press)': [
    '下背贴紧：臀部与下背部死死贴牢座椅靠背，下放时绝不可让骨盆翻转卷起！',
    '屈膝下放：控制下放到膝关节呈约90度，避免过度屈膝导致膝关节压力骤增。',
    '起立不锁死：推到最高点时膝盖保持微屈，绝对不要完全超伸卡死膝关节！'
  ],
  '坐姿腿屈伸': [
    '轴心对齐：调节机器使旋转轴心正对膝关节侧面，挡垫放在小腿脚踝上方。',
    '踢起到顶：大腿前侧发力向上踢起至双腿伸直，顶峰停顿挤压股四头肌。',
    '慢速下落：还原时不要借助重力猛坠，控制速度 2 秒下落。'
  ],
  '俯卧腿弯举': [
    '骨盆压实：俯卧紧抓把手，将骨盆和髋部紧贴卧垫，不要弓腰抬臀借力。',
    '勾腿收缩：大腿后侧腘绳肌发力将滚筒勾向臀部，在最顶端短暂停留。',
    '充分放长：匀速下放至小腿接近伸直，感受肌肉纤维被逐渐拉长。'
  ],
  '臀推 (Hip Thrust)': [
    '上背靠凳：肩胛骨下缘抵住卧推凳边沿，双脚与肩同宽踩实地面。',
    '下巴内收：推起时眼睛始终直视前方或膝盖，不要仰头后倒。',
    '顶峰骨盆后倾：推至大腿与躯干呈一条水平线，顶峰用力夹紧臀部 1-2 秒。'
  ],
  '杠铃推举 (OHP)': [
    '紧绷下肢：双脚与髋同宽，夹紧臀部并收紧核心腹肌，提供坚固底座。',
    '让头垂直推：起推时头部微后仰让出杠铃垂直轨迹，杠铃过头顶后头部自然归位。',
    '过顶锁定：推至最高点时肩胛骨向上耸起锁定，杠铃与脚踝处于同一垂直平面。'
  ],
  '坐姿哑铃推举': [
    '椅背微倾：建议椅背调至 75°~85°（略微后倾），避免完全 90° 造成肩关节撞击。',
    '前臂垂直：推举全过程中，小臂在侧面看始终垂直于地面，手肘微朝前。',
    '推到顶点：向上弧线推至哑铃在头顶上方微聚拢，不要强行在头顶相撞。'
  ],
  '哑铃侧平举': [
    '肩甲平面：大臂微屈，向身体侧前方约 15° 抬起（位于肩胛骨平面），呈平缓弧线。',
    '手肘导向：由手肘主导向上提拉至与肩平行，手肘略高于手腕。',
    '沉肩严禁耸：意念完全放在中束，下沉肩胛骨，绝对不要靠斜方肌耸肩带起。'
  ],
  '绳索面拉 (Face Pull)': [
    '滑轮高度：将绳索滑轮调至与眼睛或额头平齐。',
    '大拇指朝后：采用正握或对握拉向面部，手肘向外向上打开。',
    '外旋收缩：拉到面部两侧时用力做肩外旋动作，挤压三角肌后束与上背部。'
  ],
  '杠铃弯举': [
    '大臂贴肋：大臂固定在身体两侧不前后摆动，手肘作为唯一回转轴。',
    '手腕中立：手腕微屈锁死，不要在弯举过程中过度翻卷手腕借力。',
    '离心慢落：控制重量匀速下放至手臂接近伸直，充分刺激二头肌长头与短头。'
  ],
  '哑铃交替弯举': [
    '自然旋后：下放时掌心相对，弯举到半程时手腕逐渐向外翻转（旋后）以最大化二头肌峰收缩。',
    '躯干稳定：不要借助身体左右摇晃的惯性甩起哑铃。'
  ],
  '锤式弯举': [
    '对握掌心：全程双手掌心相对，重点刺激肱肌和肱桡肌（增大小臂与手臂厚度）。',
    '大臂静止：保持肘关节固定，只活动小臂。'
  ],
  '绳索下压 (三头)': [
    '手肘钉住：大臂垂直地面夹紧肋骨，在整个做组过程中如同钉住一般不前后移动。',
    '下压分绳：压到底部时手腕向身体两侧略微外展分开，最大化三头肌外侧头收缩。',
    '小臂回屈：回放至小臂略高于水平线即可，无需过度向上屈肘。'
  ]
};

export function getExerciseCues(exercise?: { name: string; techniqueCues?: string[]; description?: string }): string[] {
  if (!exercise) return [];
  if (exercise.techniqueCues && exercise.techniqueCues.length > 0) {
    return exercise.techniqueCues;
  }
  if (DEFAULT_TECHNIQUE_CUES[exercise.name]) {
    return DEFAULT_TECHNIQUE_CUES[exercise.name];
  }
  if (exercise.description && exercise.description.trim()) {
    return [exercise.description.trim()];
  }
  return ['保持核心刚性收紧，动作全幅度受控完成，顶峰稍作停顿，配合平稳呼吸。'];
}

