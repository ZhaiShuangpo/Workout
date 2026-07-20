import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateWholePortions, effectiveLoad, estimatedOneRepMax, formatPace, nutritionTargets, setMeetsPlan, setVolume } from './fitness.ts';
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

test('计划完成度按记录模式判断', () => {
  const plan: PlannedExercise = { exerciseId: 1, order: 0, targetSets: 3, minReps: 8, maxReps: 12, restSeconds: 90, targetDurationSeconds: 60 };
  assert.equal(setMeetsPlan({ ...baseSet, reps: 7, setKind: 'working' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), false);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 10, setKind: 'working' }, plan, { name: '卧推', muscleGroup: '胸部', description: '', recordingMode: 'weight_reps' }), true);
  assert.equal(setMeetsPlan({ ...baseSet, reps: 0, durationSeconds: 60, setKind: 'working' }, plan, { name: '平板', muscleGroup: '核心', description: '', recordingMode: 'timed_hold' }), true);
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
