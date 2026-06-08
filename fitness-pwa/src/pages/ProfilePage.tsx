import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkoutSession, type WorkoutSet, type WorkoutTemplate, type Exercise } from '../db';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, Calendar, Zap, Trash2, ChevronDown, ChevronUp, TrendingUp, Flame, Scale } from 'lucide-react';

function SessionCard({ session, sets, templates, exercises, bodyWeight }: { session: WorkoutSession, sets: WorkoutSet[], templates: WorkoutTemplate[], exercises: Exercise[], bodyWeight: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 获取模板名称
  const templateName = session.templateId 
    ? templates?.find(t => t.id === session.templateId)?.name || '未知计划'
    : '自由训练';
  
  // 获取相关组数计算该次训练的总容量
  const sessionSets = sets?.filter(s => s.sessionId === session.id) || [];
  const totalVolume = sessionSets.reduce((total, set) => {
    const w = set.weight > 0 ? set.weight : bodyWeight;
    return total + (w * set.reps);
  }, 0);

  // 按动作分组
  const groupedSets = sessionSets.reduce((acc, set) => {
    if (!acc[set.exerciseId]) acc[set.exerciseId] = [];
    acc[set.exerciseId].push(set);
    return acc;
  }, {} as Record<number, WorkoutSet[]>);

  // 格式化时长
  let durationStr = '进行中';
  if (session.endTime) {
    const diffMs = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    const diffMins = Math.round(diffMs / 60000);
    durationStr = `${diffMins} 分钟`;
  }

  const dateStr = new Date(session.startTime).toLocaleDateString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div style={{
      backgroundColor: 'var(--surface-color)',
      padding: '16px',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{templateName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={14} /> {dateStr}
          </span>
          <button 
            onClick={async (e) => {
              e.stopPropagation();
              if (confirm('确定删除这条训练记录吗？相关的组数数据也会被一并删除。')) {
                await db.workoutSets.where({ sessionId: session.id }).delete();
                await db.workoutSessions.delete(session.id!);
              }
            }}
            style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', opacity: 0.8 }}>
        <span>时长: {durationStr}</span>
        <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>
          容量: {totalVolume} kg
        </span>
      </div>

      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          background: 'none', border: 'none', color: 'var(--text-color)', opacity: 0.6, cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0 0 0', marginTop: '4px', borderTop: '1px dashed var(--border-color)'
        }}
      >
        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {Object.entries(groupedSets).map(([exId, setsArray]) => {
            const exName = exercises.find(e => e.id === Number(exId))?.name || '未知动作';
            return (
              <div key={exId} style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--primary-color)' }}>{exName}</div>
                {setsArray.map((set, idx) => (
                  <div key={set.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', opacity: 0.8, padding: '4px 0', borderBottom: idx === setsArray.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                    <span>第 {idx + 1} 组</span>
                    <span>{set.weight > 0 ? `${set.weight} kg` : '自重'}</span>
                    <span>{set.reps} 次{set.rpe ? ` @ RPE ${set.rpe}` : ''}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  // 从 Dexie 获取所有的记录（按时间倒序）
  const sessions = useLiveQuery(() => db.workoutSessions.orderBy('startTime').reverse().toArray());
  const sets = useLiveQuery(() => db.workoutSets.toArray());
  const templates = useLiveQuery(() => db.workoutTemplates.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());

  const [chartType, setChartType] = useState<'volume' | '1rm'>('volume');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number>(0);

  const [bodyWeight] = useState<number>(() => {
    const saved = localStorage.getItem('nutrition_profile');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.weight) return Number(data.weight);
      } catch {
        // ignore
      }
    }
    return 70;
  });

  // Body metrics queries
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('date').reverse().toArray());
  const bodyMetricsList = useMemo(() => bodyMetrics || [], [bodyMetrics]);

  const [inputWeight, setInputWeight] = useState<string>('');
  const [inputBodyFat, setInputBodyFat] = useState<string>('');
  const [inputDate, setInputDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [isWeightPrepopulated, setIsWeightPrepopulated] = useState(false);
  useEffect(() => {
    if (!isWeightPrepopulated && bodyMetrics !== undefined) {
      const timer = setTimeout(() => {
        if (bodyMetrics.length > 0) {
          setInputWeight(String(bodyMetrics[0].weight));
          if (bodyMetrics[0].bodyFat) {
            setInputBodyFat(String(bodyMetrics[0].bodyFat));
          }
        } else if (bodyWeight) {
          setInputWeight(String(bodyWeight));
        }
        setIsWeightPrepopulated(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [bodyMetrics, bodyWeight, isWeightPrepopulated]);

  const handleSaveMetric = async () => {
    const w = parseFloat(inputWeight);
    if (isNaN(w) || w <= 0) {
      alert('请输入有效的体重数据');
      return;
    }
    const bf = inputBodyFat ? parseFloat(inputBodyFat) : undefined;
    if (bf !== undefined && (isNaN(bf) || bf < 1 || bf > 100)) {
      alert('请输入有效的体脂率百分比 (1-100)');
      return;
    }

    const recordDate = new Date(inputDate + 'T00:00:00');

    const existing = bodyMetricsList.find(m => {
      const d = new Date(m.date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateStr === inputDate;
    });

    if (existing) {
      await db.bodyMetrics.update(existing.id!, {
        weight: w,
        bodyFat: bf
      });
    } else {
      await db.bodyMetrics.add({
        date: recordDate,
        weight: w,
        bodyFat: bf
      });
    }

    alert('体征记录保存成功！');
  };

  const bodyMetricsChartData = useMemo(() => {
    const sorted = [...bodyMetricsList].sort((a, b) => a.date.getTime() - b.date.getTime());
    return sorted.map(m => {
      const d = new Date(m.date);
      return {
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        '体重 (kg)': m.weight,
        '体脂率 (%)': m.bodyFat !== undefined ? m.bodyFat : null
      };
    });
  }, [bodyMetricsList]);

  const hasBodyFat = useMemo(() => {
    return bodyMetricsChartData.some(d => d['体脂率 (%)'] !== null);
  }, [bodyMetricsChartData]);

  const heatmapData = useMemo(() => {
    const today = new Date();
    const startSunday = new Date(today);
    startSunday.setDate(today.getDate() - today.getDay() - 17 * 7);
    startSunday.setHours(0, 0, 0, 0);

    const days = [];
    const temp = new Date(startSunday);
    for (let i = 0; i < 126; i++) {
      days.push(new Date(temp));
      temp.setDate(temp.getDate() + 1);
    }

    const counts: Record<string, number> = {};
    if (sessions) {
      sessions.forEach(s => {
        if (s.endTime) {
          const date = new Date(s.startTime);
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          counts[dateStr] = (counts[dateStr] || 0) + 1;
        }
      });
    }

    return { days, counts };
  }, [sessions]);

  const smallInputStyle = {
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-color)',
    color: 'var(--text-color)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const
  };



  // Derived state: filter exercises that have completed sets
  const exercisesWithData = useMemo(() => {
    if (!exercises || !sets) return [];
    const exerciseIdsWithSets = new Set(sets.map(s => s.exerciseId));
    return exercises.filter(e => exerciseIdsWithSets.has(e.id!));
  }, [exercises, sets]);

  const defaultExerciseId = useMemo(() => {
    const list = exercisesWithData.length > 0 ? exercisesWithData : (exercises || []);
    if (list.length === 0) return 0;
    
    const coreLifts = ["杠铃平板卧推", "杠铃深蹲 (高杠)", "硬拉 (传统)", "杠铃深蹲", "杠铃卧推", "硬拉"];
    for (const liftName of coreLifts) {
      const found = list.find(e => e.name === liftName);
      if (found) return found.id!;
    }
    return list[0].id!;
  }, [exercises, exercisesWithData]);

  const activeExerciseId = selectedExerciseId || defaultExerciseId;

  // 1. 计算每个 Session 的总容量 (Volume) 和图表数据
  const chartData = useMemo(() => {
    if (!sessions || !sets) return [];

    // 我们取最近的 7 次已经结束的训练绘制图表
    const completedSessions = sessions.filter(s => s.endTime).slice(0, 7).reverse();
    
    return completedSessions.map(session => {
      // 找出当前 session 所有的组数记录
      const sessionSets = sets.filter(set => set.sessionId === session.id);
      
      // 计算总容量 Volume = sum(weight * reps)
      const volume = sessionSets.reduce((total, set) => {
        const weight = set.weight > 0 ? set.weight : bodyWeight; // 如果是徒手(0kg)算作自重
        return total + (weight * set.reps);
      }, 0);

      // 格式化日期，如 "5月12日"
      const date = new Date(session.startTime);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

      return {
        date: dateStr,
        volume: volume,
        session: session
      };
    });
  }, [sessions, sets, bodyWeight]);

  // Calculate 1RM history for the selected exercise
  const oneRepMaxData = useMemo(() => {
    if (!sessions || !sets || !activeExerciseId) return [];

    const sessionMap = new Map<number, WorkoutSession>();
    sessions.forEach(s => {
      if (s.id !== undefined && s.endTime) {
        sessionMap.set(s.id, s);
      }
    });

    const exerciseSets = sets.filter(s => s.exerciseId === activeExerciseId && s.sessionId && sessionMap.has(s.sessionId));

    const setsBySession: Record<number, WorkoutSet[]> = {};
    exerciseSets.forEach(set => {
      if (!setsBySession[set.sessionId]) {
        setsBySession[set.sessionId] = [];
      }
      setsBySession[set.sessionId].push(set);
    });

    const dataPoints = Object.entries(setsBySession).map(([sessIdStr, setsArray]) => {
      const sessId = Number(sessIdStr);
      const session = sessionMap.get(sessId)!;

      const max1RM = setsArray.reduce((max, set) => {
        const w = set.weight > 0 ? set.weight : bodyWeight;
        const estimated1RM = set.reps === 1 ? w : w * (1 + set.reps / 30);
        return Math.max(max, estimated1RM);
      }, 0);

      return {
        date: new Date(session.startTime),
        r1rm: Math.round(max1RM * 10) / 10,
        session
      };
    });

    dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

    return dataPoints.map(dp => {
      const d = dp.date;
      return {
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        '1RM': dp.r1rm
      };
    });
  }, [sessions, sets, activeExerciseId, bodyWeight]);

  // 2. 渲染历史记录列表
  const renderHistory = () => {
    if (!sessions || sessions.length === 0) {
      return <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '40px' }}>暂无训练记录，快去流汗吧！</p>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sessions.map(session => (
          <SessionCard 
            key={session.id} 
            session={session} 
            sets={sets || []} 
            templates={templates || []} 
            exercises={exercises || []} 
            bodyWeight={bodyWeight} 
          />
        ))}
      </div>
    );
  };

  const displayedExercises = exercisesWithData.length > 0 ? exercisesWithData : (exercises || []);
  const selectedExObj = exercises?.find(e => e.id === activeExerciseId);

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={24} color="var(--primary-color)" /> 
        数据统计
      </h2>

      {/* 选项卡切换 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', backgroundColor: 'var(--surface-color)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setChartType('volume')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: chartType === 'volume' ? 'var(--primary-color)' : 'transparent',
            color: chartType === 'volume' ? '#fff' : 'var(--text-color)',
            opacity: chartType === 'volume' ? 1 : 0.7,
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <Zap size={16} /> 总体积 (Volume)
        </button>
        <button
          onClick={() => setChartType('1rm')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: chartType === '1rm' ? 'var(--primary-color)' : 'transparent',
            color: chartType === '1rm' ? '#fff' : 'var(--text-color)',
            opacity: chartType === '1rm' ? 1 : 0.7,
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
        >
          <TrendingUp size={16} /> 力量估算 (1RM)
        </button>
      </div>

      {/* 图表卡片 */}
      <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {chartType === 'volume' ? (
            <>
              <Zap size={18} color="#eab308" /> 最近 7 次训练容量 (kg)
            </>
          ) : (
            <>
              <TrendingUp size={18} color="var(--primary-color)" /> {selectedExObj ? `${selectedExObj.name} ` : ''}1RM 变化趋势 (kg)
            </>
          )}
        </h3>

        {/* 1RM 专属动作下拉选择 */}
        {chartType === '1rm' && displayedExercises.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <select
              value={activeExerciseId}
              onChange={(e) => setSelectedExerciseId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-color)',
                color: 'var(--text-color)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {displayedExercises.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscleGroup})
                </option>
              ))}
            </select>
          </div>
        )}

        {chartType === 'volume' ? (
          chartData.length > 0 ? (
            <div style={{ width: '100%', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'var(--text-color)', fontSize: 12, opacity: 0.7 }}
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    tick={{ fill: 'var(--text-color)', fontSize: 12, opacity: 0.7 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'var(--border-color)', opacity: 0.5 }}
                    contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} 
                    labelStyle={{ color: 'var(--text-color)' }}
                    itemStyle={{ color: 'var(--primary-color)', fontWeight: 'bold' }}
                  />
                  <Bar 
                    dataKey="volume" 
                    fill="var(--primary-color)" 
                    radius={[4, 4, 0, 0]} 
                    name="训练容量"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '14px', margin: '40px 0' }}>完成几次训练后，图表将自动生成。</p>
          )
        ) : (
          oneRepMaxData.length > 0 ? (
            <div style={{ width: '100%', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oneRepMaxData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis 
                    dataKey="dateStr" 
                    tick={{ fill: 'var(--text-color)', fontSize: 12, opacity: 0.7 }}
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    tick={{ fill: 'var(--text-color)', fontSize: 12, opacity: 0.7 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} 
                    labelStyle={{ color: 'var(--text-color)' }}
                    itemStyle={{ color: 'var(--primary-color)', fontWeight: 'bold' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="1RM" 
                    stroke="var(--primary-color)" 
                    strokeWidth={3}
                    dot={{ fill: 'var(--primary-color)', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="估算 1RM (kg)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '14px', margin: '40px 0' }}>该动作暂无训练数据，开始训练并记录重量与次数后即可生成 1RM 趋势图！</p>
          )
        )}
      </div>

      {/* 训练出勤热力图打卡墙 */}
      <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={18} color="#f97316" /> 训练出勤墙 (最近 18 周)
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: '4px' }}>
          {/* 星期标签 */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '88px', fontSize: '10px', opacity: 0.6, marginRight: '8px', textAlign: 'right', padding: '1px 0', flexShrink: 0 }}>
            <span>日</span>
            <span>二</span>
            <span>四</span>
            <span>六</span>
          </div>
          {/* 热力图网格 */}
          <div style={{
            display: 'grid',
            gridTemplateRows: 'repeat(7, 10px)',
            gridAutoFlow: 'column',
            gridAutoColumns: '10px',
            gap: '3px'
          }}>
            {heatmapData.days.map((day, idx) => {
              const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const cnt = heatmapData.counts[dateStr] || 0;
              
              let bgColor = 'var(--bg-color)';
              if (cnt === 1) {
                bgColor = 'rgba(37, 99, 235, 0.45)'; // 浅蓝色
              } else if (cnt >= 2) {
                bgColor = 'var(--primary-color)'; // 深蓝色
              }

              const readableDate = `${day.getMonth() + 1}月${day.getDate()}日`;

              return (
                <div 
                  key={idx}
                  title={`${readableDate}: ${cnt} 次训练`}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: bgColor,
                    transition: 'all 0.1s ease',
                    cursor: 'pointer'
                  }}
                />
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '11px', opacity: 0.6 }}>
          <span>少</span>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--bg-color)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'rgba(37, 99, 235, 0.45)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--primary-color)' }} />
          <span>多</span>
        </div>
      </div>

      {/* 体征数据追踪 (体重 & 体脂率) */}
      <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Scale size={18} color="var(--primary-color)" /> 体征数据追踪
        </h3>

        {/* 录入表单 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>体重 (kg)</label>
            <input 
              type="number" 
              step="0.1"
              placeholder="kg"
              value={inputWeight} 
              onChange={e => setInputWeight(e.target.value)}
              style={smallInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>体脂率 (%)</label>
            <input 
              type="number" 
              step="0.1"
              placeholder="可选"
              value={inputBodyFat} 
              onChange={e => setInputBodyFat(e.target.value)}
              style={smallInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>日期</label>
            <input 
              type="date" 
              value={inputDate} 
              onChange={e => setInputDate(e.target.value)}
              style={{ ...smallInputStyle, padding: '7px 4px' }}
            />
          </div>
        </div>
        <button 
          onClick={handleSaveMetric}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'var(--primary-color)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer',
            marginBottom: '16px'
          }}
        >
          保存记录
        </button>

        {/* 折线图 */}
        {bodyMetricsChartData.length > 0 ? (
          <div style={{ width: '100%', height: '180px', marginTop: '16px', marginBottom: '16px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyMetricsChartData} margin={{ top: 10, right: -5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis 
                  dataKey="dateStr" 
                  tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }}
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis 
                  yAxisId="left"
                  orientation="left"
                  domain={['auto', 'auto']}
                  tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                {hasBodyFat && (
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#10b981', fontSize: 11, opacity: 0.7 }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                )}
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} 
                  labelStyle={{ color: 'var(--text-color)' }}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="体重 (kg)" 
                  stroke="var(--primary-color)" 
                  strokeWidth={3}
                  dot={{ fill: 'var(--primary-color)', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="体重 (kg)"
                />
                {hasBodyFat && (
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="体脂率 (%)" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ fill: '#10b981', r: 3 }}
                    activeDot={{ r: 5 }}
                    name="体脂率 (%)"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '13px', margin: '24px 0' }}>暂无体征数据，录入后将自动生成趋势图。</p>
        )}

        {/* 历史记录列表 */}
        {bodyMetricsList.length > 0 && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', opacity: 0.8 }}>历史记录 (最近 5 条)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bodyMetricsList.slice(0, 5).map(m => {
                const d = new Date(m.date);
                const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', opacity: 0.8, backgroundColor: 'var(--bg-color)', padding: '6px 10px', borderRadius: '6px' }}>
                    <span>📅 {dateStr}</span>
                    <span>⚖️ {m.weight} kg</span>
                    <span>🥑 {m.bodyFat !== undefined ? `${m.bodyFat}%` : '--'}</span>
                    <button 
                      onClick={async () => {
                        if (confirm('确定要删除这条体征记录吗？')) {
                          await db.bodyMetrics.delete(m.id!);
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 历史记录列表 */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>历史记录</h3>
        {renderHistory()}
      </div>
    </div>
  );
}
