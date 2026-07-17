import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateWholePortions, effectiveLoad, estimatedOneRepMax, nutritionTargets } from './fitness.ts';
import type { Exercise, UserProfile, WorkoutSet } from '../db.ts';

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
});

test('高次数组不生成误导性的1RM', () => {
  assert.equal(estimatedOneRepMax({ ...baseSet, reps: 13 }, undefined, 70), null);
  assert.equal(Math.round(estimatedOneRepMax(baseSet, undefined, 70) || 0), 27);
});

test('营养目标有安全热量下限', () => {
  const profile: UserProfile = { id: 'current', gender: 'female', age: 40, height: 150, weight: 40, activity: 1.2, goal: 'cut' };
  assert.equal(nutritionTargets(profile).calories, 1200);
});
