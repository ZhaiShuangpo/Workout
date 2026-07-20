import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkoutSession } from '../db';
import { effectiveLoad, formatDuration, formatPace, formatRecordedSet, getDistanceMeters, getDurationSeconds, paceSecondsPerKm, SET_KIND_LABELS, setMeetsPlan } from '../domain/fitness';
import { Timer, Plus, Minus, Check, Play, Square, Dumbbell, SkipForward, Trash2, RefreshCw } from 'lucide-react';

export function WorkoutPage() {
  const allExercises = useLiveQuery(() => db.exercises.toArray()) || [];
  const [selectedExId, setSelectedExId] = useState<number>(() => Number(localStorage.getItem('workout_selectedExId')) || 0);
  const [weight, setWeight] = useState<number>(() => Number(localStorage.getItem('workout_weight')) || 20); // 默认空杆
  const [reps, setReps] = useState<number>(() => Number(localStorage.getItem('workout_reps')) || 10);
  
  // 计时器与组状态
  const [restEndTime, setRestEndTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('workout_restEndTime');
    return saved && saved !== 'null' ? Number(saved) : null;
  });
  const [restTimeLeft, setRestTimeLeft] = useState<number>(0);
  const [isDoingSet, setIsDoingSet] = useState<boolean>(() => localStorage.getItem('workout_isDoingSet') === 'true');
  const [selectedRestTime, setSelectedRestTime] = useState<number>(() => Number(localStorage.getItem('workout_selectedRestTime')) || 90);
  const [rpe, setRpe] = useState<number>(() => Number(localStorage.getItem('workout_rpe')) || 8);
  const [duration, setDuration] = useState<number>(() => Number(localStorage.getItem('workout_duration')) || 20); // 默认20分钟
  const [distance, setDistance] = useState<number>(() => Number(localStorage.getItem('workout_distance')) || 2.0); // 默认2.0km
  const [durationRemainderSeconds, setDurationRemainderSeconds] = useState(0);
  const [level, setLevel] = useState(1);
  const [incline, setIncline] = useState(0);
  const [heartRate, setHeartRate] = useState(0);
  const [cadence, setCadence] = useState(0);
  const [strokeRate, setStrokeRate] = useState(0);
  const [poolLengthMeters, setPoolLengthMeters] = useState(25);
  const [swimStroke, setSwimStroke] = useState('自由泳');
  const [workSeconds, setWorkSeconds] = useState(30);
  const [recoverySeconds, setRecoverySeconds] = useState(30);
  const [intervals, setIntervals] = useState(8);
  const [setKind, setSetKind] = useState<'warmup' | 'working' | 'drop' | 'failure'>('working');
  const [loadTypeOverride, setLoadTypeOverride] = useState<'external' | 'bodyweight' | 'bodyweight-added' | 'assisted'>('external');
  const [setStartedAt, setSetStartedAt] = useState<number | null>(null);
  const [activeSetSeconds, setActiveSetSeconds] = useState(0);
  const [showAllExercises, setShowAllExercises] = useState(false);

  // 状态持久化
  useEffect(() => {
    localStorage.setItem('workout_selectedExId', String(selectedExId));
  }, [selectedExId]);
  useEffect(() => {
    localStorage.setItem('workout_weight', String(weight));
  }, [weight]);
  useEffect(() => {
    localStorage.setItem('workout_reps', String(reps));
  }, [reps]);
  useEffect(() => {
    localStorage.setItem('workout_restEndTime', String(restEndTime));
  }, [restEndTime]);
  useEffect(() => {
    localStorage.setItem('workout_isDoingSet', String(isDoingSet));
  }, [isDoingSet]);
  useEffect(() => {
    localStorage.setItem('workout_selectedRestTime', String(selectedRestTime));
  }, [selectedRestTime]);
  useEffect(() => {
    localStorage.setItem('workout_rpe', String(rpe));
  }, [rpe]);
  useEffect(() => {
    localStorage.setItem('workout_duration', String(duration));
  }, [duration]);
  useEffect(() => {
    localStorage.setItem('workout_distance', String(distance));
  }, [distance]);
  useEffect(() => {
    if (!isDoingSet || !setStartedAt) return;
    const update = () => setActiveSetSeconds(Math.max(0, Math.round((Date.now() - setStartedAt) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isDoingSet, setStartedAt]);

  const isResting = restEndTime !== null;

  // 响应式拉取数据 (使用 startTime 索引进行 $O(1)$ 最新会话状态定位，避免全表扫描)
  const activeSession = useLiveQuery(async () => {
    const latest = await db.workoutSessions.orderBy('startTime').last();
    return (latest && !latest.endTime) ? latest : null;
  });

  // 使用 sessionId 索引直接拉取当前会话的所有组数，避免复杂对象过滤
  const currentSets = useLiveQuery(() => 
    activeSession?.id 
      ? db.workoutSets.where('sessionId').equals(activeSession.id).toArray() 
      : []
  , [activeSession?.id]);

  const templates = useLiveQuery(() => db.workoutTemplates.toArray()) || [];
  const profile = useLiveQuery(() => db.userProfiles.get('current'));

  // 获取当前动作在上一次表现作为超负荷提示
  const lastExerciseSets = useLiveQuery(async () => {
    if (!selectedExId) return null;
    
    // 1. 查找当前动作所有的组记录 (利用 exerciseId 索引)
    const allSetsOfEx = await db.workoutSets
      .where('exerciseId')
      .equals(selectedExId)
      .toArray();
    
    if (allSetsOfEx.length === 0) return null;

    // 2. 获取所有的 sessionId，排除当前活跃的会话
    const sessionIds = Array.from(new Set(allSetsOfEx.map(s => s.sessionId)));
    const pastSessionIds = activeSession?.id 
      ? sessionIds.filter(id => id !== activeSession.id)
      : sessionIds;
      
    if (pastSessionIds.length === 0) return null;

    // 3. 批量获取已完成的会话数据 (使用主键索引进行批量获取，速度极快)
    const pastSessions = await db.workoutSessions.bulkGet(pastSessionIds);
    const completedPastSessions = pastSessions.filter((s): s is WorkoutSession => !!s && !!s.endTime);
    
    if (completedPastSessions.length === 0) return null;

    // 4. 排序找出最近的一次已完成会话
    completedPastSessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    const latestSession = completedPastSessions[0];

    // 5. 过滤出该次会话中当前动作的组记录
    const setsOfLatestSession = allSetsOfEx.filter(s => s.sessionId === latestSession.id);
    
    return {
      sessionDate: latestSession.startTime,
      sets: setsOfLatestSession
    };
  }, [selectedExId, activeSession?.id]);

  // 倒计时逻辑：基于绝对时间，不受息屏影响
  useEffect(() => {
    if (!restEndTime) return;

    const checkTime = () => {
      const now = Date.now();
      const left = Math.round((restEndTime - now) / 1000);
      if (left <= 0) {
        setRestTimeLeft(0);
        setRestEndTime(null);
        navigator.vibrate?.([200, 100, 200]);
        if ('Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready.then(registration => registration.showNotification('休息结束', { body: '该练下一组了！', icon: '/favicon.svg', tag: 'rest-timer' })).catch(console.error);
        }
        alert("休息结束，该练下一组了！");
      } else {
        setRestTimeLeft(left);
      }
    };

    checkTime(); // 立即执行一次
    const interval = window.setInterval(checkTime, 1000);

    // 监听页面可见性变化（从后台切回前台时立即更新）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTime();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [restEndTime]);

  const handleStartWorkout = async (templateId?: number) => {
    await db.workoutSessions.add({
      templateId,
      startTime: new Date(),
      notes: '',
      bodyWeight: profile?.weight
    });
  };

  const handleEndWorkout = async () => {
    if (activeSession?.id) {
      const incomplete = sessionTemplate?.exercises?.length
        ? sessionTemplate.exercises.length - completedForTemplate
        : 0;
      const message = (currentSets || []).length === 0
        ? '本次训练还没有记录，确认结束吗？'
        : incomplete > 0 ? `还有 ${incomplete} 个动作未达到计划目标，仍要结束吗？` : '确认结束本次训练吗？';
      if (confirm(message)) {
        await db.workoutSessions.update(activeSession.id, {
          endTime: new Date()
        });
        setRestEndTime(null);
        setIsDoingSet(false);
        setRestTimeLeft(0);
      }
    }
  };

  const handleStartSet = () => {
    setIsDoingSet(true);
    setSetStartedAt(Date.now());
    setActiveSetSeconds(0);
    setRestEndTime(null);
    setRestTimeLeft(0);
  };

  const handleFinishSet = async () => {
    if (!activeSession?.id) return;
    
    // 计算当前动作是第几组
    const exSets = currentSets?.filter(s => s.exerciseId === selectedExId) || [];
    const setNumber = Math.max(0, ...exSets.map(set => set.setNumber || 0)) + 1;

    const currentEx = allExercises.find(e => e.id === selectedExId);
    const isCardio = currentEx?.type === 'cardio';

    if (!currentEx) {
      alert('请先选择一个有效动作');
      return;
    }
    const mode = currentEx.recordingMode || (isCardio ? 'distance_time' : 'weight_reps');
    const enteredDurationSeconds = duration * 60 + durationRemainderSeconds;
    const elapsedSeconds = setStartedAt ? Math.max(1, Math.round((Date.now() - setStartedAt) / 1000)) : 0;
    const measuredDurationSeconds = enteredDurationSeconds > 0 ? enteredDurationSeconds : elapsedSeconds;
    if (rpe < 5 || rpe > 10 || selectedRestTime < 0 || selectedRestTime > 1800) {
      alert('请检查 RPE 和休息时间，休息时间应为 0-1800 秒');
      return;
    }
    if (mode === 'distance_time' || mode === 'swim') {
      if (measuredDurationSeconds <= 0 || !Number.isFinite(distance) || distance <= 0) {
        alert('该运动需要填写大于 0 的时间和距离');
        return;
      }
    } else if (mode === 'time_level' && (measuredDurationSeconds <= 0 || level < 0)) {
      alert('请填写有效的运动时间和等级/阻力');
      return;
    } else if (mode === 'timed_hold' && (measuredDurationSeconds <= 0 || weight < 0)) {
      alert('请填写有效的保持时间，额外负重不能为负数');
      return;
    } else if (mode === 'interval' && (workSeconds <= 0 || recoverySeconds < 0 || intervals <= 0)) {
      alert('请填写有效的工作时间、恢复时间和轮数');
      return;
    } else if ((mode === 'weight_reps' || mode === 'bodyweight_reps') && (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps <= 0 || reps > 100)) {
      alert('重量不能为负数，次数应为 1-100 的整数');
      return;
    }

    await db.workoutSets.add({
      sessionId: activeSession.id,
      exerciseId: selectedExId,
      setNumber,
      weight: ['weight_reps', 'bodyweight_reps', 'timed_hold'].includes(mode) ? weight : 0,
      reps: ['weight_reps', 'bodyweight_reps'].includes(mode) ? reps : 0,
      duration: ['timed_hold', 'distance_time', 'time_level', 'swim'].includes(mode) ? measuredDurationSeconds / 60 : undefined,
      distance: ['distance_time', 'swim'].includes(mode) ? distance : undefined,
      durationSeconds: ['timed_hold', 'distance_time', 'time_level', 'swim'].includes(mode) ? measuredDurationSeconds : undefined,
      distanceMeters: ['distance_time', 'swim'].includes(mode) ? Math.round(distance * 1000) : undefined,
      setKind,
      level: mode === 'time_level' ? level : undefined,
      incline: mode === 'distance_time' && incline > 0 ? incline : undefined,
      heartRate: heartRate > 0 ? heartRate : undefined,
      cadence: mode === 'distance_time' && cadence > 0 ? cadence : undefined,
      strokeRate: currentEx.name === '划船机' && strokeRate > 0 ? strokeRate : undefined,
      poolLengthMeters: mode === 'swim' ? poolLengthMeters : undefined,
      swimStroke: mode === 'swim' ? swimStroke : undefined,
      workSeconds: mode === 'interval' ? workSeconds : undefined,
      recoverySeconds: mode === 'interval' ? recoverySeconds : undefined,
      intervals: mode === 'interval' ? intervals : undefined,
      loadType: ['weight_reps', 'bodyweight_reps', 'timed_hold'].includes(mode) ? loadTypeOverride : undefined,
      rpe,
      completed: true
    });

    setIsDoingSet(false);
    setSetStartedAt(null);
    setActiveSetSeconds(0);
    const needsRest = ['weight_reps', 'bodyweight_reps', 'timed_hold'].includes(mode) && selectedRestTime > 0;
    if (needsRest) {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(console.error);
      setRestEndTime(Date.now() + selectedRestTime * 1000);
      setRestTimeLeft(selectedRestTime);
    } else {
      setRestEndTime(null);
      setRestTimeLeft(0);
    }
  };

  const handleSkipRest = () => {
    setRestEndTime(null);
    setRestTimeLeft(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // 根据当前会话的模板过滤动作列表
  const sessionTemplate = templates.find(t => t.id === activeSession?.templateId);
  const plannedIds = sessionTemplate?.exercises
    ? [...sessionTemplate.exercises].sort((a, b) => a.order - b.order).map(item => item.exerciseId)
    : sessionTemplate?.exerciseIds;
  const selectedBaseExercise = allExercises.find(e => e.id === selectedExId);
  const similarityScore = (exercise: typeof allExercises[number]) => {
    if (!selectedBaseExercise) return 0;
    let score = 0;
    if (exercise.movementPattern && exercise.movementPattern === selectedBaseExercise.movementPattern) score += 4;
    if (exercise.primaryMuscles?.some(muscle => selectedBaseExercise.primaryMuscles?.includes(muscle))) score += 3;
    if (exercise.equipment && exercise.equipment === selectedBaseExercise.equipment) score += 1;
    if (exercise.recordingMode === selectedBaseExercise.recordingMode) score += 1;
    return score;
  };
  const similarExercises = allExercises.filter(exercise => exercise.id === selectedExId || similarityScore(exercise) >= 3).toSorted((a, b) => similarityScore(b) - similarityScore(a));
  const sessionExercises = sessionTemplate
    ? showAllExercises
      ? similarExercises
      : (plannedIds || []).map(id => allExercises.find(ex => ex.id === id)).filter(ex => ex !== undefined)
    : allExercises;

  const currentEx = selectedBaseExercise;
  const isCardio = currentEx?.type === 'cardio';
  const recordingMode = currentEx?.recordingMode || (isCardio ? 'distance_time' : 'weight_reps');
  const currentPlan = sessionTemplate?.exercises?.find(item => item.exerciseId === selectedExId);
  const currentPlanText = currentPlan ? (() => {
    if (recordingMode === 'timed_hold') return `目标 ${currentPlan.targetSets} 组 × ${Math.round((currentPlan.targetDurationSeconds || 0) / 60)} 分钟`;
    if (recordingMode === 'distance_time') return `目标 ${((currentPlan.targetDistanceMeters || 0) / 1000).toFixed(1)} km / ${Math.round((currentPlan.targetDurationSeconds || 0) / 60)} 分钟`;
    if (recordingMode === 'swim') return `目标 ${currentPlan.targetDistanceMeters || 0} m / ${Math.round((currentPlan.targetDurationSeconds || 0) / 60)} 分钟`;
    if (recordingMode === 'time_level') return `目标 ${Math.round((currentPlan.targetDurationSeconds || 0) / 60)} 分钟 · 等级 ${currentPlan.targetLevel || 0}`;
    return `目标 ${currentPlan.targetSets} 组 × ${currentPlan.minReps}-${currentPlan.maxReps} 次 @ RPE ${currentPlan.targetRpe || 8}`;
  })() : '';
  const completedForTemplate = sessionTemplate?.exercises?.filter(item =>
    (currentSets || []).filter(set => set.exerciseId === item.exerciseId && setMeetsPlan(set, item, allExercises.find(exercise => exercise.id === item.exerciseId))).length >= item.targetSets
  ).length || 0;

  useEffect(() => {
    if (activeSession === null) {
      const timer = window.setTimeout(() => {
        setIsDoingSet(false);
        setRestEndTime(null);
        setRestTimeLeft(0);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeSession]);

  const applyLastPerformance = () => {
    const last = lastExerciseSets?.sets.toSorted((a, b) => a.setNumber - b.setNumber).at(-1);
    if (!last) return;
    if (recordingMode === 'weight_reps' || recordingMode === 'bodyweight_reps') {
      setWeight(last.weight);
      setReps(last.reps);
    }
    if (['timed_hold', 'distance_time', 'time_level', 'swim'].includes(recordingMode)) {
      const seconds = getDurationSeconds(last);
      setDuration(Math.floor(seconds / 60));
      setDurationRemainderSeconds(seconds % 60);
    }
    if (recordingMode === 'distance_time' || recordingMode === 'swim') setDistance(getDistanceMeters(last) / 1000);
    if (last.level !== undefined) setLevel(last.level);
    if (last.incline !== undefined) setIncline(last.incline);
    if (last.heartRate !== undefined) setHeartRate(last.heartRate);
    if (last.cadence !== undefined) setCadence(last.cadence);
    if (last.strokeRate !== undefined) setStrokeRate(last.strokeRate);
    if (last.poolLengthMeters !== undefined) setPoolLengthMeters(last.poolLengthMeters);
    if (last.swimStroke) setSwimStroke(last.swimStroke);
    if (last.loadType) setLoadTypeOverride(last.loadType);
    if (last.rpe) setRpe(last.rpe);
  };

  // 自动选中第一个动作
  useEffect(() => {
    if (sessionExercises.length > 0 && !sessionExercises.find(e => e.id === selectedExId)) {
      const timer = setTimeout(() => {
        const first = sessionExercises[0];
        setSelectedExId(first.id!);
        setLoadTypeOverride(first.loadType || 'external');
        if (first.loadType === 'bodyweight' || first.loadType === 'bodyweight-added' || first.loadType === 'assisted') setWeight(0);
        if (first.recordingMode === 'timed_hold') {
          setDuration(1);
          setDurationRemainderSeconds(0);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [sessionExercises, selectedExId]);

  // 渐进性超负荷建议渲染
  const renderOverloadSuggestion = () => {
    if (!lastExerciseSets || lastExerciseSets.sets.length === 0) return null;
    const currentExercise = allExercises.find(exercise => exercise.id === selectedExId);
    if (!currentExercise) return null;
    const { sessionDate } = lastExerciseSets;
    const pastSets = lastExerciseSets.sets.filter(set => (set.setKind || 'working') === 'working');
    if (pastSets.length === 0) return null;
    let bestSet = pastSets[0];
    let suggestion: string;

    if (recordingMode === 'distance_time' || recordingMode === 'swim') {
      const fixedDistance = (currentPlan?.targetDistanceMeters || 0) > 0;
      if (fixedDistance) {
        bestSet = pastSets.reduce((best, set) => (paceSecondsPerKm(set) || Infinity) < (paceSecondsPerKm(best) || Infinity) ? set : best);
        const pace = paceSecondsPerKm(bestSet);
        suggestion = bestSet.rpe && bestSet.rpe >= 9
          ? `上次强度较高，保持相同距离和约 ${formatPace(pace)} 的配速。`
          : `保持 ${(getDistanceMeters(bestSet) / 1000).toFixed(2)} km，将完成时间尝试缩短约 1%。`;
      } else {
        bestSet = pastSets.reduce((best, set) => getDistanceMeters(set) > getDistanceMeters(best) ? set : best);
        suggestion = bestSet.rpe && bestSet.rpe >= 9
          ? '上次强度较高，本次维持相同时间和距离。'
          : `保持 ${formatDuration(getDurationSeconds(bestSet))}，尝试增加约 ${Math.max(50, Math.round(getDistanceMeters(bestSet) * 0.02 / 10) * 10)} 米。`;
      }
    } else if (recordingMode === 'time_level') {
      bestSet = pastSets.reduce((best, set) => (set.level || 0) > (best.level || 0) ? set : best);
      suggestion = bestSet.rpe && bestSet.rpe >= 9 ? '维持上次时间和等级。' : `维持 ${formatDuration(getDurationSeconds(bestSet))}，尝试将等级提高到 ${(bestSet.level || 0) + 1}。`;
    } else if (recordingMode === 'timed_hold') {
      bestSet = pastSets.reduce((best, set) => getDurationSeconds(set) > getDurationSeconds(best) ? set : best);
      suggestion = bestSet.rpe && bestSet.rpe >= 9 ? '维持上次保持时间。' : `尝试保持 ${formatDuration(getDurationSeconds(bestSet) + 5)}，或在时间不变时小幅增加负重。`;
    } else if (recordingMode === 'interval') {
      bestSet = pastSets.reduce((best, set) => (set.intervals || 0) > (best.intervals || 0) ? set : best);
      suggestion = bestSet.rpe && bestSet.rpe >= 9 ? '维持上次轮数和工作/恢复比例。' : `尝试增加到 ${(bestSet.intervals || 0) + 1} 轮，工作和恢复时间保持不变。`;
    } else if ((bestSet.loadType || currentExercise.loadType) === 'assisted') {
      bestSet = pastSets.reduce((best, set) => set.weight < best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best);
      suggestion = bestSet.rpe && bestSet.rpe >= 9 ? '维持当前辅助重量。' : `尝试把辅助重量从 ${bestSet.weight} kg 降到 ${Math.max(0, bestSet.weight - 2.5)} kg，次数保持不变。`;
    } else {
      bestSet = pastSets.reduce((best, set) => effectiveLoad(set, currentExercise, activeSession?.bodyWeight || profile?.weight || 70) > effectiveLoad(best, currentExercise, activeSession?.bodyWeight || profile?.weight || 70) ? set : best);
      const ready = !bestSet.rpe || bestSet.rpe <= 8;
      const maxReps = currentPlan?.maxReps || 12;
      const increment = currentExercise.weightInputMode === 'per_implement' ? 1 : 2.5;
      suggestion = !ready
        ? '上次强度较高，优先稳定完成相同重量和次数。'
        : bestSet.reps >= maxReps
          ? `已达到次数上限，尝试把${currentExercise.weightInputMode === 'per_implement' ? '单只' : ''}重量提高到 ${bestSet.weight + increment} kg，并回到次数区间下限。`
          : `重量保持 ${bestSet.weight} kg，尝试完成 ${bestSet.reps + 1} 次。`;
    }

    const dateStr = new Date(sessionDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

    return (
      <div style={{
        backgroundColor: 'var(--surface-color)',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px dashed var(--primary-color)',
        marginBottom: '20px',
        fontSize: '13px',
        lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 'bold', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span>📈 渐进性超负荷建议</span>
        </div>
        <div style={{ opacity: 0.8 }}>
          上次成绩 ({dateStr}): <strong style={{ color: 'var(--text-color)' }}>{formatRecordedSet(bestSet, currentExercise)}</strong>
          {bestSet.rpe ? ` @ RPE ${bestSet.rpe}` : ''}。
        </div>
        <div style={{ marginTop: '6px', color: 'var(--success-color)', fontWeight: '500' }}>
          今日建议：{suggestion}
        </div>
      </div>
    );
  };

  // 获取当前动作的历史组数渲染
  const renderCurrentExerciseSets = () => {
    if (!currentSets || currentSets.length === 0) return null;
    const exSets = currentSets.filter(s => s.exerciseId === selectedExId);

    if (exSets.length === 0) return null;

    const currentEx = allExercises.find(e => e.id === selectedExId);

    const handleDeleteSet = async (setId: number) => {
      if (confirm('确定删除这一组记录吗？')) {
        await db.workoutSets.delete(setId);
      }
    };

    return (
      <div style={{ marginTop: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', opacity: 0.8 }}>本动作已完成</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {exSets.map((set, idx) => (
            <div key={set.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', backgroundColor: 'var(--surface-color)',
              borderRadius: '8px', border: '1px solid var(--border-color)',
              fontSize: '14px'
            }}>
              <span style={{ opacity: 0.6, width: '40px' }}>组 {idx + 1}</span>
              <span style={{ flex: 1, fontWeight: 'bold', textAlign: 'center' }}>{formatRecordedSet(set, currentEx)}</span>
              <span style={{ opacity: 0.7, fontSize: '12px', textAlign: 'center' }}>
                {set.setKind ? SET_KIND_LABELS[set.setKind] : '工作'}{set.rpe ? ` · RPE ${set.rpe}` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--success-color)' }}><Check size={18}/></span>
                <button 
                  onClick={() => handleDeleteSet(set.id!)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (activeSession === undefined) {
    return <div style={{ padding: '20px' }}>加载中...</div>;
  }

  if (activeSession === null) {
    const currentDay = new Date().getDay();
    const todayTemplates = templates.filter(t => t.scheduledDays?.includes(currentDay));
    const otherTemplates = templates.filter(t => !t.scheduledDays?.includes(currentDay));

    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px', marginBottom: '32px' }}>
          <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--surface-color)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px' }}>
            <Timer size={40} color="var(--primary-color)" />
          </div>
          <h2 style={{ marginTop: 0, marginBottom: '8px' }}>准备好流汗了吗？</h2>
          <p style={{ color: 'var(--text-color)', opacity: 0.6, textAlign: 'center', margin: 0 }}>
            选择一个计划模板，或开始自由训练。
          </p>
        </div>

        {todayTemplates.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', opacity: 0.8, color: 'var(--primary-color)' }}>🔥 今日专属计划</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {todayTemplates.map(tpl => (
                <button 
                  key={tpl.id}
                  onClick={() => handleStartWorkout(tpl.id)}
                  style={{
                    width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid var(--primary-color)',
                    backgroundColor: 'var(--surface-color)', color: 'var(--text-color)', 
                    display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.1)'
                  }}
                >
                  <Dumbbell size={20} color="var(--primary-color)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{tpl.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.6 }}>包含 {tpl.exerciseIds.length} 个动作</div>
                  </div>
                  <Play size={20} color="var(--primary-color)" />
                </button>
              ))}
            </div>
          </div>
        )}

        {otherTemplates.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', opacity: 0.8 }}>其他计划模板</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {otherTemplates.map(tpl => (
                <button 
                  key={tpl.id}
                  onClick={() => handleStartWorkout(tpl.id)}
                  style={{
                    width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--surface-color)', color: 'var(--text-color)', 
                    display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left'
                  }}
                >
                  <Dumbbell size={20} color="var(--primary-color)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{tpl.name}</div>
                    <div style={{ fontSize: '12px', opacity: 0.6 }}>包含 {tpl.exerciseIds.length} 个动作</div>
                  </div>
                  <Play size={20} color="var(--primary-color)" />
                </button>
              ))}
            </div>
          </div>
        )}

        <button 
          onClick={() => handleStartWorkout()}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'var(--primary-color)',
            backgroundColor: 'transparent',
            border: '2px dashed var(--primary-color)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            marginTop: 'auto'
          }}
        >
          <Plus size={20} />
          开始自由训练
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{sessionTemplate ? sessionTemplate.name : '今日自由训练'}</span>
        {isResting && (
          <span style={{ 
            fontSize: '16px', color: '#fff', 
            display: 'flex', alignItems: 'center', gap: '4px',
            backgroundColor: 'var(--primary-active)', padding: '4px 12px',
            borderRadius: '20px'
          }}>
            <Timer size={18} /> {formatTime(restTimeLeft)}
          </span>
        )}
      </h2>

      {sessionTemplate?.exercises && (
        <div style={{ margin: '-4px 0 18px', fontSize: '13px', opacity: 0.75 }}>
          计划进度：{completedForTemplate}/{sessionTemplate.exercises.length} 个动作达到目标组数
        </div>
      )}

      {/* 动作选择 */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>当前动作</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            value={selectedExId} 
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedExId(id);
              const plan = sessionTemplate?.exercises?.find(item => item.exerciseId === id);
              if (plan) setSelectedRestTime(plan.restSeconds);
              const exercise = allExercises.find(item => item.id === id);
              if (exercise) {
                setLoadTypeOverride(exercise.loadType || 'external');
                if (exercise.loadType === 'bodyweight' || exercise.loadType === 'bodyweight-added' || exercise.loadType === 'assisted') setWeight(0);
                if (exercise.recordingMode === 'timed_hold') {
                  setDuration(1);
                  setDurationRemainderSeconds(0);
                }
              }
            }}
            style={{ 
              flex: 1, minWidth: 0, padding: '12px', fontSize: '16px', 
              borderRadius: '8px', border: '1px solid var(--border-color)',
              backgroundColor: 'var(--surface-color)', color: 'var(--text-color)'
            }}
          >
            {sessionExercises.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
          {sessionTemplate && (
            <button onClick={() => setShowAllExercises(value => !value)} style={{ padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-color)' }}>
              {showAllExercises ? '仅计划' : '替换动作'}
            </button>
          )}
        </div>
        {(currentPlan || lastExerciseSets?.sets.length) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
            <span>{currentPlan ? currentPlanText : '临时替换动作'}</span>
            {lastExerciseSets?.sets.length ? (
              <button onClick={applyLastPerformance} style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', color: 'var(--primary-color)', cursor: 'pointer' }}>
                <RefreshCw size={13} /> 套用上次
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* 渐进性超负荷建议 */}
      {renderOverloadSuggestion()}

      {/* 根据动作记录模式呈现对应指标 */}
      {(recordingMode === 'bodyweight_reps' || recordingMode === 'timed_hold') && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          {(['bodyweight-added', 'assisted'] as const).map(mode => (
            <button key={mode} onClick={() => { setLoadTypeOverride(mode); setWeight(0); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${loadTypeOverride === mode ? 'var(--primary-color)' : 'var(--border-color)'}`, background: loadTypeOverride === mode ? 'var(--primary-color)' : 'var(--surface-color)', color: loadTypeOverride === mode ? '#fff' : 'var(--text-color)' }}>
              {mode === 'assisted' ? '辅助模式' : '自重/负重模式'}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' }}>
        {(recordingMode === 'weight_reps' || recordingMode === 'bodyweight_reps') && <>
          <MetricControl label={loadTypeOverride === 'assisted' ? '辅助重量' : loadTypeOverride === 'bodyweight-added' ? '额外负重' : currentEx?.weightInputMode === 'per_implement' ? '单只重量' : '总重量'} value={weight} step={2.5} suffix="kg" onChange={setWeight} />
          <MetricControl label={currentEx?.weightInputMode === 'per_implement' ? '每侧次数' : '次数'} value={reps} step={1} suffix="次" onChange={setReps} />
        </>}
        {recordingMode === 'timed_hold' && <>
          <MetricControl label="分钟" value={duration} step={1} suffix="分" onChange={setDuration} />
          <MetricControl label="秒" value={durationRemainderSeconds} step={5} max={59} suffix="秒" onChange={setDurationRemainderSeconds} />
          <MetricControl label={loadTypeOverride === 'assisted' ? '辅助重量' : '额外负重'} value={weight} step={2.5} suffix="kg" onChange={setWeight} />
        </>}
        {(recordingMode === 'distance_time' || recordingMode === 'swim' || recordingMode === 'time_level') && <>
          <MetricControl label="分钟" value={duration} step={1} suffix="分" onChange={setDuration} />
          <MetricControl label="秒" value={durationRemainderSeconds} step={5} max={59} suffix="秒" onChange={setDurationRemainderSeconds} />
        </>}
        {recordingMode === 'distance_time' && <MetricControl label="距离" value={distance} step={0.1} suffix="km" onChange={setDistance} />}
        {recordingMode === 'swim' && <MetricControl label="距离" value={Math.round(distance * 1000)} step={25} suffix="m" onChange={value => setDistance(value / 1000)} />}
        {recordingMode === 'time_level' && <MetricControl label="等级/阻力" value={level} step={1} onChange={setLevel} />}
        {recordingMode === 'interval' && <>
          <MetricControl label="工作" value={workSeconds} step={5} suffix="秒" onChange={setWorkSeconds} />
          <MetricControl label="恢复" value={recoverySeconds} step={5} suffix="秒" onChange={setRecoverySeconds} />
          <MetricControl label="轮数" value={intervals} step={1} suffix="轮" onChange={setIntervals} />
        </>}
      </div>
      {(recordingMode === 'distance_time' || recordingMode === 'time_level' || recordingMode === 'swim') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '20px' }}>
          <CompactMetric label="平均心率" value={heartRate} onChange={setHeartRate} suffix="bpm" />
          {currentEx?.name.includes('跑步') && <CompactMetric label="坡度" value={incline} onChange={setIncline} suffix="%" />}
          {(currentEx?.name.includes('单车') || currentEx?.name.includes('跑步')) && <CompactMetric label="踏频/步频" value={cadence} onChange={setCadence} suffix="spm" />}
          {currentEx?.name === '划船机' && <CompactMetric label="桨频" value={strokeRate} onChange={setStrokeRate} suffix="spm" />}
          {recordingMode === 'swim' && <>
            <CompactMetric label="泳池长度" value={poolLengthMeters} onChange={setPoolLengthMeters} suffix="m" />
            <label style={{ fontSize: '11px' }}>泳姿<select value={swimStroke} onChange={event => setSwimStroke(event.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'var(--surface-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}><option>自由泳</option><option>蛙泳</option><option>仰泳</option><option>蝶泳</option><option>混合泳</option></select></label>
          </>}
        </div>
      )}

      {/* 状态控制按钮 */}
      {isResting ? (
        <button 
          onClick={handleSkipRest}
          style={{
            width: '100%', padding: '16px', fontSize: '18px', fontWeight: 'bold', color: '#fff',
            backgroundColor: 'var(--primary-color)', border: 'none', borderRadius: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            cursor: 'pointer', marginBottom: '24px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}
        >
          <SkipForward size={24} />
          结束休息
        </button>
      ) : isDoingSet ? (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color)', padding: '9px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px' }}>
            <span>本组已进行 <strong>{formatDuration(activeSetSeconds)}</strong></span>
            {['timed_hold', 'distance_time', 'time_level', 'swim'].includes(recordingMode) && (
              <button onClick={() => { setDuration(Math.floor(activeSetSeconds / 60)); setDurationRemainderSeconds(activeSetSeconds % 60); }} style={{ border: 'none', background: 'none', color: 'var(--primary-color)', fontWeight: 'bold' }}>使用计时</button>
            )}
          </div>
          {!isCardio && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {([['warmup', '热身'], ['working', '工作'], ['drop', '递减'], ['failure', '力竭']] as const).map(([kind, label]) => (
                <button key={kind} onClick={() => setSetKind(kind)} style={{ flex: 1, padding: '8px 2px', borderRadius: '8px', border: `1px solid ${setKind === kind ? 'var(--primary-color)' : 'var(--border-color)'}`, background: setKind === kind ? 'var(--primary-color)' : 'var(--surface-color)', color: setKind === kind ? '#fff' : 'var(--text-color)', fontSize: '12px' }}>
                  {label}组
                </button>
              ))}
            </div>
          )}
          {/* RPE 录入 */}
          <div style={{ marginBottom: '16px', backgroundColor: 'var(--surface-color)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', opacity: 0.8 }}>RPE (运动感觉强度评分)</span>
              <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                {rpe === 5 ? '≤ 5 (轻松/热身)' : `RPE ${rpe}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[5, 6, 7, 8, 9, 10].map(val => (
                <button
                  key={val}
                  onClick={() => setRpe(val)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '8px',
                    border: `1px solid ${rpe === val ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    backgroundColor: rpe === val ? 'var(--primary-color)' : 'var(--bg-color)',
                    color: rpe === val ? '#fff' : 'var(--text-color)',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    minWidth: '40px'
                  }}
                >
                  {val}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '6px', lineHeight: 1.3 }}>
              {rpe === 10 && '🔥 竭尽全力，无法再多做一次 (RIR 0)'}
              {rpe === 9 && '⚡ 还能再多做 1 次 (RIR 1)'}
              {rpe === 8 && '💪 还能再多做 2 次 (RIR 2)'}
              {rpe === 7 && '👍 还能再多做 3 次 (RIR 3)'}
              {rpe === 6 && '👌 还能再多做 4 次 (RIR 4)'}
              {rpe === 5 && '⏳ 轻松，属于热身或拉伸组 (RIR 5+)'}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', opacity: 0.7, marginBottom: '8px' }}>本组结束后休息:</div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[60, 90, 120, 180].map(time => (
                <button
                  key={time}
                  onClick={() => setSelectedRestTime(time)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: `1px solid ${selectedRestTime === time ? 'var(--success-color)' : 'var(--border-color)'}`,
                    backgroundColor: selectedRestTime === time ? 'var(--success-color)' : 'var(--bg-color)',
                    color: selectedRestTime === time ? '#fff' : 'var(--text-color)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {time >= 60 ? `${time/60}分钟` : `${time}秒`}
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '0 12px', backgroundColor: 'var(--bg-color)' }}>
                <input 
                  type="number" 
                  value={selectedRestTime} 
                  onChange={(e) => setSelectedRestTime(Number(e.target.value))}
                  style={{ width: '40px', border: 'none', background: 'transparent', color: 'var(--text-color)', fontSize: '13px', textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: '13px', opacity: 0.7 }}>秒</span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleFinishSet}
            style={{
              width: '100%', padding: '16px', fontSize: '18px', fontWeight: 'bold', color: '#fff',
              backgroundColor: 'var(--success-color)', border: 'none', borderRadius: '12px',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Check size={24} />
            完成本组，休息 {selectedRestTime >= 60 ? `${selectedRestTime/60}分钟` : `${selectedRestTime}秒`}
          </button>
        </div>
      ) : (
        <button 
          onClick={handleStartSet}
          style={{
            width: '100%', padding: '16px', fontSize: '18px', fontWeight: 'bold', color: '#fff',
            backgroundColor: 'var(--danger-color)', border: 'none', borderRadius: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            cursor: 'pointer', marginBottom: '24px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
          }}
        >
          <Play size={24} />
          开始本组
        </button>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

      {/* 已完成的组数 */}
      {renderCurrentExerciseSets()}

      {/* 结束训练按钮 */}
      <div style={{ marginTop: '40px' }}>
        <button 
          onClick={handleEndWorkout}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'var(--danger-color)',
            backgroundColor: 'transparent',
            border: '1px solid var(--danger-color)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Square fill="currentColor" size={20} />
          结束本次训练
        </button>
      </div>

    </div>
  );
}

const btnStyle = {
  width: '32px', height: '32px', borderRadius: '50%',
  border: 'none', backgroundColor: 'var(--border-color)',
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  cursor: 'pointer', color: 'var(--text-color)',
  flexShrink: 0
};

function MetricControl({ label, value, onChange, step, max, suffix }: { label: string; value: number; onChange: (value: number) => void; step: number; max?: number; suffix?: string }) {
  const clamp = (next: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(0, next));
  return (
    <div style={{ backgroundColor: 'var(--surface-color)', padding: '14px 6px', borderRadius: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '13px', marginBottom: '8px', opacity: 0.8 }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
        <button aria-label={`减少${label}`} onClick={() => onChange(clamp(Number((value - step).toFixed(2))))} style={btnStyle}><Minus size={16} /></button>
        <input type="number" step={step} value={value || ''} onChange={event => onChange(clamp(Number(event.target.value) || 0))} style={{ fontSize: '19px', fontWeight: 'bold', width: '58px', textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text-color)', outline: 'none', padding: 0 }} />
        <button aria-label={`增加${label}`} onClick={() => onChange(clamp(Number((value + step).toFixed(2))))} style={btnStyle}><Plus size={16} /></button>
      </div>
      {suffix && <div style={{ fontSize: '10px', opacity: 0.55 }}>{suffix}</div>}
    </div>
  );
}

function CompactMetric({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix: string }) {
  return (
    <label style={{ fontSize: '11px', opacity: 0.8 }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <input type="number" min={0} value={value || ''} onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))} style={{ width: '100%', minWidth: 0, padding: '8px 5px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-color)' }} />
        <span>{suffix}</span>
      </div>
    </label>
  );
}
