import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Exercise, type WorkoutSession } from '../db';
import { Timer, Plus, Minus, Check, Play, Square, Dumbbell, SkipForward, Trash2 } from 'lucide-react';

export function WorkoutPage() {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
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

  const isResting = restEndTime !== null;

  // 响应式拉取数据
  const activeSession = useLiveQuery(async () => {
    const session = await db.workoutSessions.filter(s => !s.endTime).first();
    return session || null;
  });

  const currentSets = useLiveQuery(() => 
    activeSession?.id 
      ? db.workoutSets.where({ sessionId: activeSession.id }).toArray() 
      : []
  , [activeSession?.id]);

  const templates = useLiveQuery(() => db.workoutTemplates.toArray()) || [];

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

  useEffect(() => {
    db.exercises.toArray().then((data) => {
      setAllExercises(data);
    });
  }, []);

  // 倒计时逻辑：基于绝对时间，不受息屏影响
  useEffect(() => {
    if (!restEndTime) return;

    const checkTime = () => {
      const now = Date.now();
      const left = Math.round((restEndTime - now) / 1000);
      if (left <= 0) {
        setRestTimeLeft(0);
        setRestEndTime(null);
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
      notes: ''
    });
  };

  const handleEndWorkout = async () => {
    if (activeSession?.id) {
      if (confirm("确认结束本次训练吗？")) {
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
    setRestEndTime(null);
    setRestTimeLeft(0);
  };

  const handleFinishSet = async () => {
    if (!activeSession?.id) return;
    
    // 计算当前动作是第几组
    const exSets = currentSets?.filter(s => s.exerciseId === selectedExId) || [];
    const setNumber = exSets.length + 1;

    await db.workoutSets.add({
      sessionId: activeSession.id,
      exerciseId: selectedExId,
      setNumber,
      weight,
      reps,
      rpe,
      completed: true
    });

    setIsDoingSet(false);
    // 触发休息倒计时
    setRestEndTime(Date.now() + selectedRestTime * 1000);
    setRestTimeLeft(selectedRestTime);
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
  const sessionExercises = sessionTemplate 
    ? allExercises.filter(ex => sessionTemplate.exerciseIds.includes(ex.id!))
    : allExercises;

  // 自动选中第一个动作
  useEffect(() => {
    if (sessionExercises.length > 0 && !sessionExercises.find(e => e.id === selectedExId)) {
      const timer = setTimeout(() => {
        setSelectedExId(sessionExercises[0].id!);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [sessionExercises, selectedExId]);

  // 渐进性超负荷建议渲染
  const renderOverloadSuggestion = () => {
    if (!lastExerciseSets || lastExerciseSets.sets.length === 0) return null;
    
    const { sessionDate, sets: pastSets } = lastExerciseSets;
    let bestSet = pastSets[0];
    for (const s of pastSets) {
      if (s.weight > bestSet.weight || (s.weight === bestSet.weight && s.reps > bestSet.reps)) {
        bestSet = s;
      }
    }

    const dateStr = new Date(sessionDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const nextWeight = bestSet.weight + 2.5;
    const nextReps = bestSet.reps + 1;

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
          上次成绩 ({dateStr}): <strong style={{ color: 'var(--text-color)' }}>{bestSet.weight} kg × {bestSet.reps} 次</strong>
          {bestSet.rpe ? ` @ RPE ${bestSet.rpe}` : ''}。
        </div>
        <div style={{ marginTop: '6px', color: 'var(--success-color)', fontWeight: '500' }}>
          今日目标推荐：尝试 <span style={{ textDecoration: 'underline' }}>{nextWeight} kg × {bestSet.reps} 次</span> 或 <span style={{ textDecoration: 'underline' }}>{bestSet.weight} kg × {nextReps} 次</span>！
        </div>
      </div>
    );
  };

  // 获取当前动作的历史组数渲染
  const renderCurrentExerciseSets = () => {
    if (!currentSets || currentSets.length === 0) return null;
    const exSets = currentSets.filter(s => s.exerciseId === selectedExId);

    if (exSets.length === 0) return null;

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
              <span style={{ fontWeight: 'bold' }}>{set.weight} kg</span>
              <span style={{ fontWeight: 'bold' }}>{set.reps} 次</span>
              <span style={{ opacity: 0.7, fontSize: '13px' }}>
                {set.rpe ? `@ RPE ${set.rpe}` : ''}
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

      {/* 动作选择 */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>当前动作</label>
        <select 
          value={selectedExId} 
          onChange={(e) => setSelectedExId(Number(e.target.value))}
          style={{ 
            width: '100%', padding: '12px', fontSize: '16px', 
            borderRadius: '8px', border: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-color)', color: 'var(--text-color)'
          }}
        >
          {sessionExercises.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {/* 渐进性超负荷建议 */}
      {renderOverloadSuggestion()}

      {/* 极简大按钮录入区域 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {/* 重量 */}
        <div style={{ flex: 1, backgroundColor: 'var(--surface-color)', padding: '16px 8px', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}>重量 (kg)</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
            <button onClick={() => setWeight(w => Math.max(0, w - 2.5))} style={btnStyle}><Minus size={16}/></button>
            <input
              type="number"
              step="any"
              value={weight === 0 ? '' : weight}
              onChange={(e) => {
                const val = e.target.value;
                setWeight(val === '' ? 0 : parseFloat(val));
              }}
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                width: '60px',
                textAlign: 'center',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-color)',
                outline: 'none',
                padding: 0
              }}
            />
            <button onClick={() => setWeight(w => w + 2.5)} style={btnStyle}><Plus size={16}/></button>
          </div>
        </div>

        {/* 次数 */}
        <div style={{ flex: 1, backgroundColor: 'var(--surface-color)', padding: '16px 8px', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}>次数 (reps)</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
            <button onClick={() => setReps(r => Math.max(0, r - 1))} style={btnStyle}><Minus size={16}/></button>
            <input
              type="number"
              value={reps === 0 ? '' : reps}
              onChange={(e) => {
                const val = e.target.value;
                setReps(val === '' ? 0 : parseInt(val, 10));
              }}
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                width: '60px',
                textAlign: 'center',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-color)',
                outline: 'none',
                padding: 0
              }}
            />
            <button onClick={() => setReps(r => r + 1)} style={btnStyle}><Plus size={16}/></button>
          </div>
        </div>
      </div>

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
