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
