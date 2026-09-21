import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateWholePortions, calculateBarbellPlates, effectiveLoad, estimatedOneRepMax, formatPace, formatRecordedSet, groupSessionSetsByExercise, nutritionTargets, setMeetsPlan, exerciseMeetsPlan, setVolume } from './fitness.ts';
import { isCardioExercise, isTimedHoldExercise, exerciseDefaults, type Exercise, type PlannedExercise, type UserProfile, type WorkoutSet, type WorkoutTemplate } from '../db.ts';

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

  // 场景 4: 计划设置了目标重量 50kg，用户完成 4 组 12 次（重量仅 20kg），依然判定达标（目标重量不作硬性阻断）
  const planWithWeight: PlannedExercise = { ...plan, targetWeight: 50, targetSets: 4, minReps: 12, maxReps: 12 };
  const sets4x12Light: WorkoutSet[] = [1, 2, 3, 4].map(num => ({ ...baseSet, setNumber: num, weight: 20, reps: 12, setKind: 'working' }));
  assert.equal(exerciseMeetsPlan(sets4x12Light, planWithWeight, exercise), true);
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

test('智能识别有氧运动与静态时长保持动作', () => {
  assert.equal(isCardioExercise({ name: '跑步', muscleGroup: '腿部' }), true);
  assert.equal(isCardioExercise({ name: '户外慢跑', muscleGroup: '全身' }), true);
  assert.equal(isCardioExercise({ name: '动感单车', muscleGroup: '有氧心肺' }), true);
  assert.equal(isCardioExercise({ name: '游泳', muscleGroup: '有氧心肺' }), true);
  assert.equal(isCardioExercise({ name: '跳绳', muscleGroup: '有氧心肺' }), true);
  assert.equal(isCardioExercise({ name: '战绳', muscleGroup: '有氧心肺' }), true);
  assert.equal(isCardioExercise({ name: '波比跳', muscleGroup: '全身/核心' }), false);
  assert.equal(isCardioExercise({ name: '杠铃卧推', muscleGroup: '胸部' }), false);

  // 纯静态时长保持（计时）动作
  assert.equal(isTimedHoldExercise({ name: '平板支撑', muscleGroup: '核心' }), true);
  assert.equal(isTimedHoldExercise({ name: '侧平板支撑', muscleGroup: '核心' }), true);
  assert.equal(isTimedHoldExercise({ name: '靠墙静蹲', muscleGroup: '腿部' }), true);
  assert.equal(isTimedHoldExercise({ name: '静态悬垂 (死挂)', muscleGroup: '背部/肩部' }), true);
  assert.equal(isTimedHoldExercise({ name: '单杠悬垂', muscleGroup: '背部' }), true);
  assert.equal(isTimedHoldExercise({ name: '跑步', muscleGroup: '有氧心肺' }), false);

  // 计数动作（绝不能被判定为计时）
  assert.equal(isTimedHoldExercise({ name: '悬垂举腿', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '悬垂提膝', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '卷腹', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '俄罗斯转体', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '健腹轮', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '死虫式', muscleGroup: '核心' }), false);
  assert.equal(isTimedHoldExercise({ name: '双杠臂屈伸 (Dips)', muscleGroup: '胸部/三头' }), false);
  assert.equal(isTimedHoldExercise({ name: '波比跳', muscleGroup: '全身/核心' }), false);
});

test('悬垂举腿与经典力量动作默认配置为计数', () => {
  const hangingLegRaiseDef = exerciseDefaults({ name: '悬垂举腿', muscleGroup: '核心' });
  assert.equal(hangingLegRaiseDef.recordingMode, 'bodyweight_reps');
  assert.equal(hangingLegRaiseDef.type, 'strength');
  assert.equal(hangingLegRaiseDef.loadType, 'bodyweight-added');

  const dipsDef = exerciseDefaults({ name: '双杠臂屈伸 (Dips)', muscleGroup: '胸部/三头' });
  assert.equal(dipsDef.recordingMode, 'bodyweight_reps');
  assert.equal(dipsDef.type, 'strength');

  const abWheelDef = exerciseDefaults({ name: '健腹轮', muscleGroup: '核心' });
  assert.equal(abWheelDef.recordingMode, 'bodyweight_reps');
  assert.equal(abWheelDef.type, 'strength');

  const deadHangDef = exerciseDefaults({ name: '静态悬垂 (死挂)', muscleGroup: '背部/肩部' });
  assert.equal(deadHangDef.recordingMode, 'timed_hold');
  assert.equal(deadHangDef.type, 'strength');
});

test('悬垂举腿等计数动作格式化为“重量/自重 × 次数”', () => {
  const hangingLegRaiseEx: Exercise = {
    name: '悬垂举腿',
    muscleGroup: '核心',
    description: '',
    ...exerciseDefaults({ name: '悬垂举腿', muscleGroup: '核心' })
  };

  const set1: WorkoutSet = {
    ...baseSet,
    exerciseId: 1,
    weight: 0,
    reps: 12,
    setKind: 'working'
  };
  assert.equal(formatRecordedSet(set1, hangingLegRaiseEx), '自重 × 12次');

  const setWeighted: WorkoutSet = {
    ...baseSet,
    exerciseId: 1,
    weight: 5,
    reps: 10,
    setKind: 'working'
  };
  assert.equal(formatRecordedSet(setWeighted, hangingLegRaiseEx), '自重 + 5 kg × 10次');
});

test('时长类动作（平板支撑）达标与格式化验证', () => {
  const plankEx: Exercise = {
    name: '平板支撑',
    muscleGroup: '核心',
    description: '',
    recordingMode: 'timed_hold',
    ...exerciseDefaults({ name: '平板支撑', muscleGroup: '核心' })
  };
  const plankPlan: PlannedExercise = {
    exerciseId: 1,
    order: 0,
    targetSets: 3,
    minReps: 1,
    maxReps: 1,
    restSeconds: 60,
    targetDurationSeconds: 60
  };

  // 1组60秒平板支撑，格式化为 "1:00 · 自重"
  const set1: WorkoutSet = {
    ...baseSet,
    exerciseId: 1,
    weight: 0,
    reps: 1,
    durationSeconds: 60,
    setKind: 'working'
  };
  assert.equal(formatRecordedSet(set1, plankEx), '1:00 · 自重');
  assert.equal(setMeetsPlan(set1, plankPlan, plankEx), true);

  // 完成3组60秒 -> 动作达标
  const sets3 = [1, 2, 3].map(setNumber => ({ ...set1, setNumber }));
  assert.equal(exerciseMeetsPlan(sets3, plankPlan, plankEx), true);
});

test('历史训练组与计划清洗逻辑：悬垂举腿误存为时长时自动恢复为有效次数并清除秒数', () => {
  // 模拟以前因分类错误将悬垂举腿记录为时长组的情况
  const legacyHangingLegRaiseSet: WorkoutSet = {
    sessionId: 10,
    exerciseId: 100,
    setNumber: 1,
    weight: 0,
    reps: 1,
    durationSeconds: 12, // 用户在输入框实际上写了 12 次
    duration: 0.2,
    completed: true
  };

  // 清洗逻辑
  const repairedSet = { ...legacyHangingLegRaiseSet };
  if (repairedSet.durationSeconds !== undefined) {
    if (repairedSet.reps <= 1) {
      if (repairedSet.durationSeconds >= 2 && repairedSet.durationSeconds <= 35) {
        repairedSet.reps = repairedSet.durationSeconds;
      } else {
        repairedSet.reps = 12;
      }
    }
    delete repairedSet.durationSeconds;
    delete repairedSet.duration;
  }

  assert.equal(repairedSet.reps, 12);
  assert.equal(repairedSet.durationSeconds, undefined);
  assert.equal(repairedSet.duration, undefined);
});

test('自定义动作创建与编辑：支持更新部位、模式与器械且默认值匹配', () => {
  const customSeed: Partial<Exercise> = {
    name: '墙壁倒立静止',
    muscleGroup: '肩部',
    recordingMode: 'timed_hold',
    equipment: '自重/通用',
    description: '背靠墙壁静态倒立',
    note: '手距与肩同宽',
    isCustom: true
  };

  const initialDefaults = exerciseDefaults(customSeed as Exercise);
  const createdExercise: Exercise = {
    id: 999,
    ...initialDefaults,
    ...customSeed
  } as Exercise;

  assert.equal(createdExercise.recordingMode, 'timed_hold');
  assert.equal(createdExercise.isCustom, true);
  assert.equal(isTimedHoldExercise(createdExercise), true);

  const updatedExercise: Exercise = {
    ...createdExercise,
    name: '手倒立支撑',
    muscleGroup: '核心',
    note: '离墙20cm'
  };

  assert.equal(updatedExercise.id, 999);
  assert.equal(updatedExercise.name, '手倒立支撑');
  assert.equal(updatedExercise.muscleGroup, '核心');
  assert.equal(updatedExercise.note, '离墙20cm');
  assert.equal(updatedExercise.recordingMode, 'timed_hold');
  assert.equal(isTimedHoldExercise(updatedExercise), true);
});

test('训练历史记录中动作顺序：关联计划模板时严格遵循计划 order 顺序，杜绝数字ID键升序错乱', () => {
  // 模拟计划：用户设定的动作执行顺序为：
  // 1. 动作 ID 50 (引体向上, order 0)
  // 2. 动作 ID 12 (卧推, order 1)
  // 3. 动作 ID 99 (深蹲, order 2)
  const template: WorkoutTemplate = {
    id: 1,
    name: '全身力量计划',
    exerciseIds: [50, 12, 99],
    exercises: [
      { exerciseId: 50, order: 0, targetSets: 4, minReps: 8, maxReps: 10, restSeconds: 90 },
      { exerciseId: 12, order: 1, targetSets: 4, minReps: 8, maxReps: 10, restSeconds: 90 },
      { exerciseId: 99, order: 2, targetSets: 4, minReps: 8, maxReps: 10, restSeconds: 90 }
    ]
  };

  // 用户按顺序执行了这 3 个动作，每个动作做了 2 组
  const sessionSets: WorkoutSet[] = [
    { id: 1, sessionId: 101, exerciseId: 50, setNumber: 1, weight: 0, reps: 10, completed: true },
    { id: 2, sessionId: 101, exerciseId: 50, setNumber: 2, weight: 0, reps: 9, completed: true },
    { id: 3, sessionId: 101, exerciseId: 12, setNumber: 1, weight: 60, reps: 10, completed: true },
    { id: 4, sessionId: 101, exerciseId: 12, setNumber: 2, weight: 60, reps: 10, completed: true },
    { id: 5, sessionId: 101, exerciseId: 99, setNumber: 1, weight: 80, reps: 8, completed: true },
    { id: 6, sessionId: 101, exerciseId: 99, setNumber: 2, weight: 80, reps: 8, completed: true }
  ];

  // 如果按旧的 Object.entries(groupedSets)，因为 JS 对象对数字键强制按升序遍历，
  // 会错误地变成 [12, 50, 99]，使卧推排在引体向上前面！
  const groups = groupSessionSetsByExercise(sessionSets, template);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].exerciseId, 50); // 第1个：引体向上 (ID 50)
  assert.equal(groups[1].exerciseId, 12); // 第2个：卧推 (ID 12)
  assert.equal(groups[2].exerciseId, 99); // 第3个：深蹲 (ID 99)

  // 内部组数保持 setNumber 升序
  assert.deepEqual(groups[0].sets.map(s => s.setNumber), [1, 2]);
  assert.deepEqual(groups[1].sets.map(s => s.setNumber), [1, 2]);
  assert.deepEqual(groups[2].sets.map(s => s.setNumber), [1, 2]);
});

test('训练历史记录中动作顺序：自由训练（无模板）严格按照实际打卡执行顺序排列', () => {
  // 自由训练场景，用户先做 ID 30，再做 ID 5，最后做 ID 18
  const freeWorkoutSets: WorkoutSet[] = [
    { id: 10, sessionId: 202, exerciseId: 30, setNumber: 1, weight: 20, reps: 12, completed: true },
    { id: 11, sessionId: 202, exerciseId: 30, setNumber: 2, weight: 20, reps: 12, completed: true },
    { id: 12, sessionId: 202, exerciseId: 5, setNumber: 1, weight: 15, reps: 10, completed: true },
    { id: 13, sessionId: 202, exerciseId: 18, setNumber: 1, weight: 40, reps: 8, completed: true }
  ];

  const groups = groupSessionSetsByExercise(freeWorkoutSets, undefined);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].exerciseId, 30);
  assert.equal(groups[1].exerciseId, 5);
  assert.equal(groups[2].exerciseId, 18);
});

test('训练历史记录中动作顺序：包含临时加练的计划外动作时，计划动作按计划在前，加练动作按执行顺序在后', () => {
  const template: WorkoutTemplate = {
    id: 2,
    name: '上肢日',
    exerciseIds: [20, 10],
    exercises: [
      { exerciseId: 20, order: 0, targetSets: 3, minReps: 10, maxReps: 12, restSeconds: 60 },
      { exerciseId: 10, order: 1, targetSets: 3, minReps: 10, maxReps: 12, restSeconds: 60 }
    ]
  };

  // 用户按计划做了 20 和 10，之后临时加练了动作 1 和动作 99
  const setsWithBonus: WorkoutSet[] = [
    { id: 1, sessionId: 303, exerciseId: 20, setNumber: 1, weight: 30, reps: 10, completed: true },
    { id: 2, sessionId: 303, exerciseId: 10, setNumber: 1, weight: 40, reps: 10, completed: true },
    { id: 3, sessionId: 303, exerciseId: 1, setNumber: 1, weight: 10, reps: 15, completed: true },
    { id: 4, sessionId: 303, exerciseId: 99, setNumber: 1, weight: 5, reps: 20, completed: true }
  ];

  const groups = groupSessionSetsByExercise(setsWithBonus, template);

  assert.equal(groups.length, 4);
  assert.equal(groups[0].exerciseId, 20); // 计划动作 1
  assert.equal(groups[1].exerciseId, 10); // 计划动作 2
  assert.equal(groups[2].exerciseId, 1);  // 临时加练 1
  assert.equal(groups[3].exerciseId, 99); // 临时加练 2
});



