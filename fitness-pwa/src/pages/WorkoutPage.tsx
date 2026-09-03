import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkoutSession, type WorkoutSet } from '../db';
import {
  estimatedOneRepMax,
  exerciseMeetsPlan,
  formatDuration,
  formatRecordedSet,
  getDistanceMeters,
  getDurationSeconds,
  setVolume,
  triggerRestEndAlert
} from '../domain/fitness';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { WorkoutSummaryModal, type WorkoutSummaryData } from '../components/WorkoutSummaryModal';
import {
  Timer,
  Plus,
  Minus,
  Check,
  Play,
  Dumbbell,
  SkipForward,
  Trash2,
  RefreshCw,
  Square,
  Edit3
} from 'lucide-react';

export function WorkoutPage() {
  const allExercises = useLiveQuery(() => db.exercises.toArray()) || [];
  const [selectedExId, setSelectedExId] = useState<number>(() => Number(localStorage.getItem('workout_selectedExId')) || 0);
  const [weight, setWeight] = useState<number>(() => Number(localStorage.getItem('workout_weight')) || 20); // 默认空杆 20kg
  const [reps, setReps] = useState<number>(() => Number(localStorage.getItem('workout_reps')) || 8);
  const [duration, setDuration] = useState<number>(() => Number(localStorage.getItem('workout_duration')) || 20); // 默认20分钟
  const [distance, setDistance] = useState<number>(() => Number(localStorage.getItem('workout_distance')) || 3.0); // 默认3.0km
  const [rpe, setRpe] = useState<number>(() => Number(localStorage.getItem('workout_rpe')) || 8);
  const [selectedRestTime, setSelectedRestTime] = useState<number>(() => Number(localStorage.getItem('workout_selectedRestTime')) || 90);
  
  // 组间休息倒计时状态
  const [restEndTime, setRestEndTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('workout_restEndTime');
    return saved && saved !== 'null' ? Number(saved) : null;
  });
  const [restTimeLeft, setRestTimeLeft] = useState<number>(0);
  const [showAllExercises, setShowAllExercises] = useState(false);

  // 弹窗状态
  const [showPlateCalculator, setShowPlateCalculator] = useState(false);
  const [summaryData, setSummaryData] = useState<WorkoutSummaryData | null>(null);

  // 状态持久化
  useEffect(() => { localStorage.setItem('workout_selectedExId', String(selectedExId)); }, [selectedExId]);
  useEffect(() => { localStorage.setItem('workout_weight', String(weight)); }, [weight]);
  useEffect(() => { localStorage.setItem('workout_reps', String(reps)); }, [reps]);
  useEffect(() => { localStorage.setItem('workout_duration', String(duration)); }, [duration]);
  useEffect(() => { localStorage.setItem('workout_distance', String(distance)); }, [distance]);
  useEffect(() => { localStorage.setItem('workout_rpe', String(rpe)); }, [rpe]);
  useEffect(() => { localStorage.setItem('workout_selectedRestTime', String(selectedRestTime)); }, [selectedRestTime]);
  useEffect(() => { localStorage.setItem('workout_restEndTime', String(restEndTime)); }, [restEndTime]);

  const isResting = restEndTime !== null;

  // 活跃会话与组数数据
  const activeSession = useLiveQuery(async () => {
    const latest = await db.workoutSessions.orderBy('startTime').last();
    return (latest && !latest.endTime) ? latest : null;
  });

  const currentSets = useLiveQuery(() => 
    activeSession?.id 
      ? db.workoutSets.where('sessionId').equals(activeSession.id).toArray() 
      : []
  , [activeSession?.id]);

  const templates = useLiveQuery(() => db.workoutTemplates.toArray()) || [];
  const profile = useLiveQuery(() => db.userProfiles.get('current'));

  // 获取当前动作在上一次已完成训练中的表现
  const lastExerciseSets = useLiveQuery(async () => {
    if (!selectedExId) return null;
    const allSetsOfEx = await db.workoutSets.where('exerciseId').equals(selectedExId).toArray();
    if (allSetsOfEx.length === 0) return null;

    const sessionIds = Array.from(new Set(allSetsOfEx.map(s => s.sessionId)));
    const pastSessionIds = activeSession?.id ? sessionIds.filter(id => id !== activeSession.id) : sessionIds;
    if (pastSessionIds.length === 0) return null;

    const pastSessions = await db.workoutSessions.bulkGet(pastSessionIds);
    const completedPastSessions = pastSessions.filter((s): s is WorkoutSession => !!s && !!s.endTime);
    if (completedPastSessions.length === 0) return null;

    completedPastSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    const latestPastSession = completedPastSessions[0];
    const targetSets = allSetsOfEx.filter(s => s.sessionId === latestPastSession.id);
    targetSets.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));

    return {
      sessionDate: latestPastSession.startTime,
      sets: targetSets
    };
  }, [selectedExId, activeSession?.id]);

  // 休息倒计时逻辑（支持息屏与后台切回）
  useEffect(() => {
    if (!restEndTime) return;

    const checkTime = () => {
      const now = Date.now();
      const left = Math.round((restEndTime - now) / 1000);
      if (left <= 0) {
        setRestTimeLeft(0);
        setRestEndTime(null);
        // 触发声音与震动提醒
        triggerRestEndAlert();
        if ('Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready.then(reg => reg.showNotification('休息结束 ⏰', {
            body: '组间休息已完成，准备好开始下一组！',
            icon: '/favicon.svg',
            tag: 'rest-timer'
          })).catch(console.error);
        }
      } else {
        setRestTimeLeft(left);
      }
    };

    checkTime();
    const interval = window.setInterval(checkTime, 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkTime();
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
    if (!activeSession?.id) return;

    const incomplete = sessionTemplate?.exercises?.length
      ? sessionTemplate.exercises.length - completedForTemplate
      : 0;
    const message = (currentSets || []).length === 0
      ? '本次训练还没有记录，确认结束吗？'
      : incomplete > 0 ? `还有 ${incomplete} 个动作未达到计划目标，仍要结束吗？` : '确认结束本次训练吗？';

    if (confirm(message)) {
      const sets = currentSets || [];
      const endTime = new Date();
      await db.workoutSessions.update(activeSession.id, { endTime });

      // 计算战报总结数据
      const diffMs = endTime.getTime() - new Date(activeSession.startTime).getTime();
      const durationMinutes = Math.max(1, Math.round(diffMs / 60000));
      const totalVolumeKg = sets.reduce((sum, s) => {
        const ex = allExercises.find(e => e.id === s.exerciseId);
        return sum + (ex?.type === 'cardio' ? 0 : setVolume(s, ex, activeSession.bodyWeight || profile?.weight || 70));
      }, 0);

      // 计算是否突破 1RM
      const newPrs: WorkoutSummaryData['newPrs'] = [];
      const distinctExIds = Array.from(new Set(sets.map(s => s.exerciseId)));
      for (const exId of distinctExIds) {
        const ex = allExercises.find(e => e.id === exId);
        if (!ex || ex.type === 'cardio') continue;
        const todaySets = sets.filter(s => s.exerciseId === exId && (s.setKind || 'working') !== 'warmup');
        let maxToday1RM = 0;
        let maxSet: WorkoutSet | null = null;
        for (const s of todaySets) {
          const rm = estimatedOneRepMax(s, ex, profile?.weight || 70);
          if (rm && rm > maxToday1RM) {
            maxToday1RM = rm;
            maxSet = s;
          }
        }
        if (!maxSet || maxToday1RM <= 0) continue;

        const allPast = await db.workoutSets.where('exerciseId').equals(exId).toArray();
        const otherPast = allPast.filter(s => s.sessionId !== activeSession.id && (s.setKind || 'working') !== 'warmup');
        let maxPast1RM = 0;
        for (const s of otherPast) {
          const rm = estimatedOneRepMax(s, ex, profile?.weight || 70);
          if (rm && rm > maxPast1RM) maxPast1RM = rm;
        }

        if (maxPast1RM > 0 && maxToday1RM > maxPast1RM) {
          newPrs.push({
            exerciseName: ex.name,
            weight: maxSet.weight,
            reps: maxSet.reps,
            estimated1RM: Math.round(maxToday1RM)
          });
        }
      }

      setSummaryData({
        durationMinutes,
        totalVolumeKg,
        totalSets: sets.length,
        completedExercisesCount: completedForTemplate,
        totalExercisesCount: sessionTemplate?.exercises?.length || distinctExIds.length,
        newPrs
      });

      setRestEndTime(null);
      setRestTimeLeft(0);
    }
  };

  // 一键完成本组并自动开启休息倒计时
  const handleFinishSet = async (isWarmup = false) => {
    if (!activeSession?.id) return;
    const currentEx = allExercises.find(e => e.id === selectedExId);
    if (!currentEx) {
      alert('请先选择一个有效动作');
      return;
    }

    const exSets = currentSets?.filter(s => s.exerciseId === selectedExId) || [];
    const setNumber = Math.max(0, ...exSets.map(s => s.setNumber || 0)) + 1;
    const isCardio = currentEx.type === 'cardio';

    if (isCardio) {
      if (duration <= 0) {
        alert('请填写有效的运动时长');
        return;
      }
    } else {
      if (weight < 0 || reps <= 0) {
        alert('请填写有效的重量与次数');
        return;
      }
    }

    await db.workoutSets.add({
      sessionId: activeSession.id,
      exerciseId: selectedExId,
      setNumber,
      weight: isCardio ? 0 : weight,
      reps: isCardio ? 0 : reps,
      duration: isCardio ? duration : undefined,
      distance: isCardio ? distance : undefined,
      durationSeconds: isCardio ? duration * 60 : undefined,
      distanceMeters: isCardio ? Math.round(distance * 1000) : undefined,
      setKind: isWarmup ? 'warmup' : 'working',
      rpe,
      completed: true
    });

    // 自动开启休息倒计时
    if (!isCardio && selectedRestTime > 0) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(console.error);
      }
      setRestEndTime(Date.now() + selectedRestTime * 1000);
      setRestTimeLeft(selectedRestTime);
    }
  };

  const handleSkipRest = () => {
    setRestEndTime(null);
    setRestTimeLeft(0);
  };

  const handleAdjustRest = (secondsDelta: number) => {
    if (!restEndTime) return;
    const nextEnd = restEndTime + secondsDelta * 1000;
    setRestEndTime(nextEnd);
    setRestTimeLeft(Math.max(0, Math.round((nextEnd - Date.now()) / 1000)));
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
  const currentPlan = sessionTemplate?.exercises?.find(item => item.exerciseId === selectedExId);

  const currentPlanText = currentPlan ? (() => {
    if (isCardio) {
      return `目标 ${((currentPlan.targetDistanceMeters || 0) / 1000).toFixed(1)} km / ${Math.round((currentPlan.targetDurationSeconds || 0) / 60)} 分钟`;
    }
    return `目标 ${currentPlan.targetSets} 组 × ${currentPlan.minReps}-${currentPlan.maxReps} 次 @ RPE ${currentPlan.targetRpe || 8}`;
  })() : '';

  const completedForTemplate = sessionTemplate?.exercises?.filter(item =>
    exerciseMeetsPlan(currentSets || [], item, allExercises.find(exercise => exercise.id === item.exerciseId))
  ).length || 0;

  // 动作专属器械备忘快速编辑
  const handleEditNote = async () => {
    if (!currentEx?.id) return;
    const current = currentEx.note || '';
    const next = prompt('输入该动作的器械备忘（如：座椅高度4档，靠背孔位2）：', current);
    if (next !== null) {
      await db.exercises.update(currentEx.id, { note: next.trim() || undefined });
    }
  };

  const applyLastPerformance = () => {
    const last = lastExerciseSets?.sets.toSorted((a, b) => a.setNumber - b.setNumber).at(-1);
    if (!last) return;
    if (!isCardio) {
      setWeight(last.weight);
      setReps(last.reps);
    } else {
      const seconds = getDurationSeconds(last);
      setDuration(Math.floor(seconds / 60));
      setDistance(getDistanceMeters(last) / 1000);
    }
    if (last.rpe) setRpe(last.rpe);
  };

  // 自动选中第一个动作
  useEffect(() => {
    if (sessionExercises.length > 0 && (!selectedExId || !sessionExercises.some(ex => ex.id === selectedExId))) {
      const timer = window.setTimeout(() => {
        const firstId = sessionExercises[0].id!;
        setSelectedExId(firstId);
        const plan = sessionTemplate?.exercises?.find(item => item.exerciseId === firstId);
        if (plan?.restSeconds) setSelectedRestTime(plan.restSeconds);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [sessionExercises, selectedExId, sessionTemplate]);

  // 当前动作用来对比的上周同组数据
  const currentExSets = useMemo(() => currentSets?.filter(s => s.exerciseId === selectedExId) || [], [currentSets, selectedExId]);
  const currentSetNum = currentExSets.length + 1;
  const lastSameSet = useMemo(() => {
    if (!lastExerciseSets?.sets) return null;
    return lastExerciseSets.sets.find(s => (s.setNumber || 0) === currentSetNum) || lastExerciseSets.sets[currentSetNum - 1] || null;
  }, [lastExerciseSets, currentSetNum]);

  // 渐进性超负荷建议渲染
  const renderOverloadSuggestion = () => {
    if (!lastExerciseSets || lastExerciseSets.sets.length === 0 || !currentEx) return null;
    const pastSets = lastExerciseSets.sets.filter(set => (set.setKind || 'working') === 'working');
    if (pastSets.length === 0) return null;

    let bestSet: WorkoutSet;
    let suggestion: string;

    if (isCardio) {
      bestSet = pastSets.reduce((best, set) => getDistanceMeters(set) > getDistanceMeters(best) ? set : best);
      suggestion = `保持 ${formatDuration(getDurationSeconds(bestSet))}，尝试将距离增加约 0.2 km。`;
    } else {
      bestSet = pastSets.reduce((best, set) => (set.weight * set.reps) > (best.weight * best.reps) ? set : best);
      const maxReps = currentPlan?.maxReps || 12;
      if (bestSet.reps >= maxReps) {
        suggestion = `已达上限次数，尝试重量增加 2.5 kg（即 ${bestSet.weight + 2.5} kg），次数回到 ${currentPlan?.minReps || 8} 次。`;
      } else {
        suggestion = `重量保持 ${bestSet.weight} kg，尝试比上次多完成 1 次（即 ${bestSet.reps + 1} 次）。`;
      }
    }

    const dateStr = new Date(lastExerciseSets.sessionDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

    return (
      <div style={{
        backgroundColor: 'var(--surface-color)',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px dashed var(--primary-color)',
        marginBottom: '16px',
        fontSize: '12px',
        lineHeight: 1.4
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>📈 上次表现 ({dateStr})</span>
          <span style={{ opacity: 0.8 }}>最佳: <strong>{formatRecordedSet(bestSet, currentEx)}</strong></span>
        </div>
        <div style={{ marginTop: '4px', color: 'var(--success-color)', fontWeight: '500' }}>
          建议：{suggestion}
        </div>
      </div>
    );
  };

  // 动作已完成组数展示
  const renderCurrentExerciseSets = () => {
    if (currentExSets.length === 0) return null;

    const handleDeleteSet = async (setId: number) => {
      if (confirm('确定删除这一组记录吗？')) {
        await db.workoutSets.delete(setId);
      }
    };

    return (
      <div style={{ marginTop: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', opacity: 0.8, fontSize: '14px' }}>本动作已完成 ({currentExSets.length} 组)</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {currentExSets.map((set, idx) => (
            <div key={set.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', backgroundColor: 'var(--surface-color)',
              borderRadius: '8px', border: '1px solid var(--border-color)',
              fontSize: '14px'
            }}>
              <span style={{ opacity: 0.6, width: '40px' }}>组 {idx + 1}</span>
              <span style={{ flex: 1, fontWeight: 'bold', textAlign: 'center' }}>{formatRecordedSet(set, currentEx)}</span>
              <span style={{ opacity: 0.7, fontSize: '12px', textAlign: 'center', width: '70px' }}>
                {set.setKind === 'warmup' ? '热身' : '正式'}{set.rpe ? ` · RPE ${set.rpe}` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--success-color)' }}><Check size={18}/></span>
                <button 
                  onClick={() => handleDeleteSet(set.id!)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <Trash2 size={16} />
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
            width: '100%', padding: '16px', fontSize: '16px', fontWeight: 'bold',
            color: 'var(--primary-color)', backgroundColor: 'transparent',
            border: '2px dashed var(--primary-color)', borderRadius: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            cursor: 'pointer', marginTop: 'auto'
          }}
        >
          <Plus size={20} />
          开始自由训练
        </button>

        {summaryData && (
          <WorkoutSummaryModal data={summaryData} onClose={() => setSummaryData(null)} />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* 顶部状态栏 */}
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{sessionTemplate ? sessionTemplate.name : '今日自由训练'}</span>
        {isResting && (
          <span style={{ 
            fontSize: '15px', color: '#fff', 
            display: 'flex', alignItems: 'center', gap: '4px',
            backgroundColor: 'var(--primary-color)', padding: '4px 12px',
            borderRadius: '20px'
          }}>
            <Timer size={16} /> 休息中 {formatTime(restTimeLeft)}
          </span>
        )}
      </h2>

      {sessionTemplate?.exercises && (
        <div style={{ margin: '-6px 0 16px', fontSize: '13px', opacity: 0.75 }}>
          计划进度：{completedForTemplate}/{sessionTemplate.exercises.length} 个动作达标
        </div>
      )}

      {/* 动作选择器 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '14px' }}>当前动作</label>
          {sessionTemplate && (
            <button 
              onClick={() => setShowAllExercises(v => !v)} 
              style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-color)', cursor: 'pointer' }}
            >
              {showAllExercises ? '显示计划动作' : '临时替换同类动作'}
            </button>
          )}
        </div>

        <select 
          value={selectedExId} 
          onChange={(e) => {
            const id = Number(e.target.value);
            setSelectedExId(id);
            const plan = sessionTemplate?.exercises?.find(item => item.exerciseId === id);
            if (plan?.restSeconds) setSelectedRestTime(plan.restSeconds);
          }}
          style={{ 
            width: '100%', padding: '12px', fontSize: '16px', fontWeight: '500',
            borderRadius: '10px', border: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-color)', color: 'var(--text-color)'
          }}
        >
          {sessionExercises.map(ex => {
            const plan = sessionTemplate?.exercises?.find(item => item.exerciseId === ex.id);
            const isMet = plan ? exerciseMeetsPlan(currentSets || [], plan, ex) : false;
            return (
              <option key={ex.id} value={ex.id}>
                {isMet ? '✅ ' : ''}{ex.name}
              </option>
            );
          })}
        </select>

        {/* 动作目标与套用上次 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
          <span>
            {currentPlan ? (
              <>
                {currentPlanText}
                {exerciseMeetsPlan(currentSets || [], currentPlan, currentEx) && (
                  <span style={{ marginLeft: '6px', color: 'var(--success-color)', fontWeight: 'bold' }}>
                    (已达标 ✅)
                  </span>
                )}
              </>
            ) : '自由/替换动作'}
          </span>
          {lastExerciseSets?.sets.length ? (
            <button onClick={applyLastPerformance} style={{ display: 'flex', alignItems: 'center', gap: '3px', border: 'none', background: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '12px' }}>
              <RefreshCw size={12} /> 套用上次
            </button>
          ) : null}
        </div>

        {/* 【新功能 4】动作专属器械备忘/孔位记录 */}
        {currentEx && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            {currentEx.note ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706',
                padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)'
              }}>
                <span>📌 器械备忘: {currentEx.note}</span>
                <button
                  onClick={handleEditNote}
                  style={{ border: 'none', background: 'none', color: '#d97706', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                  title="修改器械备忘"
                >
                  <Edit3 size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleEditNote}
                style={{
                  border: '1px dashed var(--border-color)', background: 'transparent',
                  color: 'var(--text-color)', opacity: 0.6, cursor: 'pointer',
                  padding: '3px 8px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <Plus size={12} /> 添加器械孔位/角度备忘
              </button>
            )}
          </div>
        )}
      </div>

      {/* 渐进性超负荷建议 */}
      {renderOverloadSuggestion()}

      {/* 【新功能 2】上周同组历史数据精确透视 (做第 N 组精准对标) */}
      {!isCardio && (
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <span><strong>第 {currentSetNum} 组准备</strong></span>
          <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
            {lastSameSet 
              ? `🎯 上次第 ${currentSetNum} 组: ${lastSameSet.weight}kg × ${lastSameSet.reps}次${lastSameSet.rpe ? ` @ RPE ${lastSameSet.rpe}` : ''}`
              : `🎯 首次挑战第 ${currentSetNum} 组`}
          </span>
        </div>
      )}

      {/* 核心指标录入区 (极简、专注) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {!isCardio ? (
          <>
            <MetricControl 
              label="重量" 
              value={weight} 
              step={2.5} 
              suffix="kg" 
              onChange={setWeight} 
              extraButton={
                <span 
                  onClick={() => setShowPlateCalculator(true)}
                  style={{ color: 'var(--primary-color)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', marginLeft: '4px' }}
                >
                  🧮 算片
                </span>
              }
            />
            <MetricControl label="次数" value={reps} step={1} suffix="次" onChange={setReps} />
          </>
        ) : (
          <>
            <MetricControl label="运动时长" value={duration} step={5} suffix="分钟" onChange={setDuration} />
            <MetricControl label="运动距离" value={distance} step={0.5} suffix="km" onChange={setDistance} />
          </>
        )}
      </div>

      {/* 力量训练辅助项：RPE 强度 & 组间休息时长选择 */}
      {!isCardio && (
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '12px' }}>
            <span style={{ opacity: 0.75 }}>主观负荷强度 (RPE):</span>
            <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
              {rpe === 5 ? '≤ 5 (轻松/热身)' : `RPE ${rpe}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {[6, 7, 8, 9, 10].map(val => (
              <button
                key={val}
                onClick={() => setRpe(val)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: '6px',
                  border: `1px solid ${rpe === val ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  background: rpe === val ? 'var(--primary-color)' : 'var(--bg-color)',
                  color: rpe === val ? '#fff' : 'var(--text-color)',
                  fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                {val}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ opacity: 0.75 }}>预设组间休息:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[60, 90, 120, 180].map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedRestTime(sec)}
                  style={{
                    padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                    border: `1px solid ${selectedRestTime === sec ? 'var(--success-color)' : 'var(--border-color)'}`,
                    background: selectedRestTime === sec ? 'var(--success-color)' : 'transparent',
                    color: selectedRestTime === sec ? '#fff' : 'var(--text-color)',
                    cursor: 'pointer'
                  }}
                >
                  {sec}秒
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 【核心交互】休息中状态面板 vs 一键完成本组 */}
      {isResting ? (
        <div style={{
          backgroundColor: 'var(--surface-color)',
          border: '2px solid var(--primary-color)',
          borderRadius: '16px',
          padding: '16px',
          textAlign: 'center',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(37, 99, 235, 0.15)'
        }}>
          <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>组间休息倒计时</div>
          <div style={{ fontSize: '38px', fontWeight: 'bold', color: 'var(--primary-color)', fontFamily: 'monospace', margin: '4px 0' }}>
            {formatTime(restTimeLeft)}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => handleAdjustRest(30)}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-color)', fontSize: '13px', cursor: 'pointer' }}
            >
              +30 秒
            </button>
            <button
              onClick={handleSkipRest}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <SkipForward size={16} /> 结束休息
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {!isCardio && (
            <button
              onClick={() => handleFinishSet(true)}
              style={{
                padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)',
                backgroundColor: 'var(--surface-color)', color: 'var(--text-color)',
                fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              记为热身组
            </button>
          )}
          <button 
            onClick={() => handleFinishSet(false)}
            style={{
              flex: 1, padding: '15px', fontSize: '17px', fontWeight: 'bold', color: '#fff',
              backgroundColor: 'var(--success-color)', border: 'none', borderRadius: '12px',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
              cursor: 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Check size={22} />
            完成第 {currentSetNum} 组 {!isCardio && `(休${selectedRestTime}s)`}
          </button>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

      {/* 本动作已完成的组数 */}
      {renderCurrentExerciseSets()}

      {/* 结束训练大按钮 */}
      <div style={{ marginTop: '36px' }}>
        <button 
          onClick={handleEndWorkout}
          style={{
            width: '100%', padding: '14px', fontSize: '15px', fontWeight: 'bold',
            color: 'var(--danger-color)', backgroundColor: 'transparent',
            border: '1px solid var(--danger-color)', borderRadius: '12px',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            cursor: 'pointer'
          }}
        >
          <Square fill="currentColor" size={16} />
          结束本次训练
        </button>
      </div>

      {/* 【新功能 3】杠铃片速算器弹窗 */}
      {showPlateCalculator && (
        <PlateCalculatorModal weight={weight} onClose={() => setShowPlateCalculator(false)} />
      )}

      {/* 【新功能 5】训练结束战报总结弹窗 */}
      {summaryData && (
        <WorkoutSummaryModal data={summaryData} onClose={() => setSummaryData(null)} />
      )}
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

function MetricControl({
  label,
  value,
  onChange,
  step,
  max,
  suffix,
  extraButton
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  max?: number;
  suffix?: string;
  extraButton?: React.ReactNode;
}) {
  const clamp = (next: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(0, next));
  return (
    <div style={{ backgroundColor: 'var(--surface-color)', padding: '12px 6px', borderRadius: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '13px', marginBottom: '8px', opacity: 0.8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <span>{label}</span>
        {extraButton}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
        <button aria-label={`减少${label}`} onClick={() => onChange(clamp(Number((value - step).toFixed(2))))} style={btnStyle}><Minus size={16} /></button>
        <input 
          type="number" 
          step={step} 
          value={value || ''} 
          onChange={event => onChange(clamp(Number(event.target.value) || 0))} 
          style={{ fontSize: '20px', fontWeight: 'bold', width: '60px', textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text-color)', outline: 'none', padding: 0 }} 
        />
        <button aria-label={`增加${label}`} onClick={() => onChange(clamp(Number((value + step).toFixed(2))))} style={btnStyle}><Plus size={16} /></button>
      </div>
      {suffix && <div style={{ fontSize: '10px', opacity: 0.55, marginTop: '2px' }}>{suffix}</div>}
    </div>
  );
}
