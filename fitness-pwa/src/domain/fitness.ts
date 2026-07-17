import type { Exercise, WorkoutSet, UserProfile } from '../db';

export function effectiveLoad(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  const entered = Math.max(0, Number(set.weight) || 0);
  switch (exercise?.loadType) {
    case 'bodyweight': return bodyWeight;
    case 'bodyweight-added': return bodyWeight + entered;
    case 'assisted': return Math.max(0, bodyWeight - entered);
    default: return entered;
  }
}

export function setVolume(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  if (exercise?.type === 'cardio') return 0;
  return effectiveLoad(set, exercise, bodyWeight) * Math.max(0, set.reps);
}

export function estimatedOneRepMax(set: WorkoutSet, exercise: Exercise | undefined, bodyWeight: number) {
  if (set.reps < 1 || set.reps > 12) return null;
  const load = effectiveLoad(set, exercise, bodyWeight);
  return set.reps === 1 ? load : load * (1 + set.reps / 30);
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
