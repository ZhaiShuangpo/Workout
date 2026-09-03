import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateWholePortions, calculateBarbellPlates, effectiveLoad, estimatedOneRepMax, formatPace, nutritionTargets, setMeetsPlan, exerciseMeetsPlan, setVolume } from './fitness.ts';
import type { Exercise, PlannedExercise, UserProfile, WorkoutSet } from '../db.ts';

const baseSet: WorkoutSet = { sessionId: 1, exerciseId: 1, setNumber: 1, weight: 20, reps: 10, completed: true };

test('份数分配始终守恒', () => {
  for (let total = 0; total < 20; total += 1) {
    assert.equal(allocateWholePortions(total).reduce((sum, value) => sum + value, 0), total);
  }
});

test('按动作负荷类型计算真实负荷', () => {
  const exercise = (loadType: Exercise['loadType']): Exercise => ({ name: '测试', muscleGroup: '测试', description: '', loadType });
  assert.equal(effectiveLoad(baseSet, exercise('external'), 70), 20);
  assert.equal(effectiveLoad(baseSet, exercise('bodyweight-added'), 70), 90);
  assert.equal(effectiveLoad(baseSet, exercise('assisted'), 70), 50);
  assert.equal(effectiveLoad(baseSet, { ...exercise('external'), weightInputMode: 'per_implement', implementCount: 2 }, 70), 40);
});

test('热身组不计容量', () => {
  assert.equal(setVolume({ ...baseSet, setKind: 'warmup' }, { name: '卧推', muscleGroup: '胸部', description: '', countInVolume: true }, 70), 0);
});

test('计划完成度按记录模式判断：超过目标次数依然判定为单组达标', () => {
  const plan: PlannedExercise = { exerciseId: 1, order: 0, targetSets: 4, minReps: 6, maxReps: 8, restSeconds: 90 };
  assert.equal(setMeetsPlan({ ...baseSet, reps: 5, setKind: 'working' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), false);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 8, setKind: 'working' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), true);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 10, setKind: 'working' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), true);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 10, setKind: 'warmup' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), false);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 0, durationSeconds: 60, setKind: 'working' }, { ...plan, targetDurationSeconds: 60 }, { name: '平板', muscleGroup: '核心', description: '', recordingMode: 'timed_hold' }), true);
});

test('动作整体达标：完成4组10次或6组8次或超量完成均判定为达标', () => {
  const plan: PlannedExercise = { exerciseId: 1, order: 0, targetSets: 4, minReps: 6, maxReps: 8, restSeconds: 90 };
  const exercise: Exercise = { id: 1, name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' };
  
  // 场景 1: 完成 4 组 10 次（目标 4 组 6-8 次）
  const sets4x10: WorkoutSet[] = [1, 2, 3, 4].map(num => ({ ...baseSet, setNumber: num, reps: 10, setKind: 'working' }));
  assert.equal(exerciseMeetsPlan(sets4x10, plan, exercise), true);

  // 场景 2: 完成 6 组 8 次（目标 4 组 6-8 次）
  const sets6x8: WorkoutSet[] = [1, 2, 3, 4, 5, 6].map(num => ({ ...baseSet, setNumber: num, reps: 8, setKind: 'working' }));
  assert.equal(exerciseMeetsPlan(sets6x8, plan, exercise), true);

  // 场景 3: 完成 3 组 12 次（总次数 36 次 >= 目标最低 24 次）
  const sets3x12: WorkoutSet[] = [1, 2, 3].map(num => ({ ...baseSet, setNumber: num, reps: 12, setKind: 'working' }));
  assert.equal(exerciseMeetsPlan(sets3x12, plan, exercise), true);
});

test('配速格式使用秒级精度', () => {
  assert.equal(formatPace(330), '5:30/km');
});

test('高次数组不生成误导性的1RM', () => {
  assert.equal(estimatedOneRepMax({ ...baseSet, reps: 13 }, undefined, 70), null);
  assert.equal(Math.round(estimatedOneRepMax(baseSet, undefined, 70) || 0), 27);
});

test('营养目标有安全热量下限', () => {
  const profile: UserProfile = { id: 'current', gender: 'female', age: 40, height: 150, weight: 40, activity: 1.2, goal: 'cut' };
  assert.equal(nutritionTargets(profile).calories, 1200);
});

test('杠铃片速算器准确计算单侧挂片', () => {
  // 100kg 总重，20kg 杠铃杆，单侧 40kg -> 25kg + 15kg
  const calc100 = calculateBarbellPlates(100, 20);
  assert.equal(calc100.perSideWeight, 40);
  assert.deepEqual(calc100.plates, [{ weight: 25, count: 1 }, { weight: 15, count: 1 }]);
  assert.equal(calc100.remainder, 0);

  // 82.5kg 总重，20kg 杆，单侧 31.25kg -> 25kg + 5kg + 1.25kg
  const calc82_5 = calculateBarbellPlates(82.5, 20);
  assert.equal(calc82_5.perSideWeight, 31.25);
  assert.deepEqual(calc82_5.plates, [{ weight: 25, count: 1 }, { weight: 5, count: 1 }, { weight: 1.25, count: 1 }]);
  assert.equal(calc82_5.remainder, 0);

  // 20kg 只有杠铃杆，单侧 0kg
  const calc20 = calculateBarbellPlates(20, 20);
  assert.equal(calc20.perSideWeight, 0);
  assert.equal(calc20.plates.length, 0);
});

