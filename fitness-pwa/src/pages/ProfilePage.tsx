import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkoutSession, type WorkoutSet, type WorkoutTemplate, type Exercise } from '../db';
import { estimatedOneRepMax, formatRecordedSet, SET_KIND_LABELS, setVolume } from '../domain/fitness';
import { downloadBackup, restoreBackup } from '../domain/backup';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, Calendar, Zap, Trash2, ChevronDown, ChevronUp, TrendingUp, Flame, Scale, Download, Upload, Moon, Sun } from 'lucide-react';

function SessionCard({ session, sets, templates, exercises, bodyWeight }: { session: WorkoutSession, sets: WorkoutSet[], templates: WorkoutTemplate[], exercises: Exercise[], bodyWeight: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 获取模板名称
  const templateName = session.templateId 
    ? templates?.find(t => t.id === session.templateId)?.name || '未知计划'
    : '自由训练';
  
  // 获取相关组数计算该次训练的总容量（排除有氧运动）
  const sessionSets = sets?.filter(s => s.sessionId === session.id) || [];
  const totalVolume = sessionSets.reduce((total, set) => {
    const exercise = exercises?.find(e => e.id === set.exerciseId);
    if (exercise?.type === 'cardio') return total;
    return total + setVolume(set, exercise, session.bodyWeight ?? bodyWeight);
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
                await db.transaction('rw', [db.workoutSets, db.workoutSessions], async () => {
                  await db.workoutSets.where({ sessionId: session.id }).delete();
                  await db.workoutSessions.delete(session.id!);
                });
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
          容量: {totalVolume.toLocaleString()} kg
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
            const exercise = exercises.find(e => e.id === Number(exId));
            const exName = exercise?.name || '未知动作';
            const isCardio = exercise?.type === 'cardio';
            return (
              <div key={exId} style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--primary-color)' }}>{exName}</div>
                {setsArray.map((set, idx) => (
                  <div key={set.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', opacity: 0.8, padding: '4px 0', borderBottom: idx === setsArray.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                    <span>第 {idx + 1} 组</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>{formatRecordedSet(set, exercise)}</span>
                    <span>{!isCardio && (set.setKind ? SET_KIND_LABELS[set.setKind] : '工作')}{set.rpe ? ` · RPE ${set.rpe}` : ''}</span>
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 从 Dexie 获取数据
  const sessions = useLiveQuery(() => db.workoutSessions.orderBy('startTime').reverse().toArray());
  const sets = useLiveQuery(() => db.workoutSets.toArray());
  const templates = useLiveQuery(() => db.workoutTemplates.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());
  const profile = useLiveQuery(() => db.userProfiles.get('current'));

  const [chartType, setChartType] = useState<'1rm' | 'volume'>('1rm');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number>(0);

  // 体重追踪相关
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('date').reverse().toArray());
  const bodyMetricsList = useMemo(() => bodyMetrics || [], [bodyMetrics]);
  const bodyWeight = bodyMetricsList[0]?.weight || profile?.weight || 70;
  const [inputWeight, setInputWeight] = useState<string>('');

  useEffect(() => {
    if (bodyWeight && !inputWeight) {
      const timer = window.setTimeout(() => setInputWeight(String(bodyWeight)), 0);
      return () => window.clearTimeout(timer);
    }
  }, [bodyWeight, inputWeight]);

  const handleSaveWeight = async () => {
    const w = parseFloat(inputWeight);
    if (isNaN(w) || w <= 0 || w > 350) {
      alert('请输入有效的体重数值 (kg)');
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const existing = bodyMetricsList.find(m => {
      const d = new Date(m.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
    });

    await db.transaction('rw', [db.bodyMetrics, db.userProfiles], async () => {
      if (existing) {
        await db.bodyMetrics.update(existing.id!, { weight: w });
      } else {
        await db.bodyMetrics.add({ date: today, weight: w });
      }
      if (profile) await db.userProfiles.update('current', { weight: w });
    });

    alert('今日体重已记录！');
  };

  const handleRestore = async (file: File | undefined) => {
    if (!file || !confirm('恢复备份会替换当前设备上的全部健身数据，确定继续吗？')) return;
    try {
      await restoreBackup(file);
      alert('数据恢复成功');
    } catch (error) {
      alert(error instanceof Error ? error.message : '数据恢复失败');
    }
  };

  // 核心统计指标汇总 (Core Statistics Summary)
  const coreStats = useMemo(() => {
    const completedSessions = sessions?.filter(s => s.endTime) || [];
    const totalCount = completedSessions.length;

    let totalDurationMs = 0;
    for (const s of completedSessions) {
      totalDurationMs += new Date(s.endTime!).getTime() - new Date(s.startTime).getTime();
    }
    const totalHours = Math.round(totalDurationMs / (1000 * 60 * 60) * 10) / 10;

    const totalVolumeKg = (sets || []).reduce((sum, set) => {
      const ex = exercises?.find(e => e.id === set.exerciseId);
      if (ex?.type === 'cardio') return sum;
      return sum + setVolume(set, ex, bodyWeight);
    }, 0);

    return {
      totalCount,
      totalHours,
      totalVolumeKg,
      bodyWeight
    };
  }, [sessions, sets, exercises, bodyWeight]);

  // 出勤热力图数据 (18 周)
  const heatmapData = useMemo(() => {
    const today = new Date();
    const startSunday = new Date(today);
    startSunday.setDate(today.getDate() - today.getDay() - 17 * 7);
    startSunday.setHours(0, 0, 0, 0);

    const days: Date[] = [];
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

  // 动作筛选（用于 1RM 走势图）
  const strengthExercisesWithData = useMemo(() => {
    if (!exercises || !sets) return [];
    const exerciseIdsWithSets = new Set(sets.map(s => s.exerciseId));
    return exercises.filter(e => exerciseIdsWithSets.has(e.id!) && e.type !== 'cardio');
  }, [exercises, sets]);

  const defaultExerciseId = useMemo(() => {
    if (strengthExercisesWithData.length === 0) return 0;
    const coreLifts = ["杠铃平板卧推", "杠铃深蹲 (高杠)", "硬拉 (传统)", "杠铃深蹲", "杠铃卧推", "硬拉", "哑铃卧推"];
    for (const lift of coreLifts) {
      const found = strengthExercisesWithData.find(e => e.name === lift);
      if (found) return found.id!;
    }
    return strengthExercisesWithData[0].id!;
  }, [strengthExercisesWithData]);

  const activeExerciseId = selectedExerciseId || defaultExerciseId;
  const selectedExObj = exercises?.find(e => e.id === activeExerciseId);

  // 1RM 趋势折线图数据
  const oneRepMaxData = useMemo(() => {
    if (!sessions || !sets || !activeExerciseId) return [];

    const sessionMap = new Map<number, WorkoutSession>();
    sessions.forEach(s => {
      if (s.id !== undefined && s.endTime) sessionMap.set(s.id, s);
    });

    const exerciseSets = sets.filter(s => s.exerciseId === activeExerciseId && s.sessionId && sessionMap.has(s.sessionId));
    const setsBySession: Record<number, WorkoutSet[]> = {};
    exerciseSets.forEach(set => {
      if (!setsBySession[set.sessionId]) setsBySession[set.sessionId] = [];
      setsBySession[set.sessionId].push(set);
    });

    const dataPoints = Object.entries(setsBySession).map(([sessIdStr, setsArray]) => {
      const sessId = Number(sessIdStr);
      const session = sessionMap.get(sessId)!;
      const max1RM = setsArray.reduce((max, set) => {
        const exercise = exercises?.find(item => item.id === set.exerciseId);
        const value = estimatedOneRepMax(set, exercise, bodyWeight);
        return value === null ? max : Math.max(max, value);
      }, 0);

      return {
        date: new Date(session.startTime),
        r1rm: Math.round(max1RM * 10) / 10
      };
    });

    dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    return dataPoints.map(dp => {
      const d = dp.date;
      return {
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        '1RM (kg)': dp.r1rm
      };
    });
  }, [sessions, sets, activeExerciseId, bodyWeight, exercises]);

  // 最近 7 次训练容量柱状图数据
  const volumeChartData = useMemo(() => {
    if (!sessions || !sets) return [];
    const completedSessions = sessions.filter(s => s.endTime).slice(0, 7).reverse();

    return completedSessions.map(session => {
      const sessionSets = sets.filter(set => set.sessionId === session.id);
      const volume = sessionSets.reduce((total, set) => {
        const exercise = exercises?.find(e => e.id === set.exerciseId);
        if (exercise?.type === 'cardio') return total;
        return total + setVolume(set, exercise, bodyWeight);
      }, 0);

      const d = new Date(session.startTime);
      return {
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        '训练容量 (kg)': volume
      };
    });
  }, [sessions, sets, bodyWeight, exercises]);

  // 体重走势折线图数据
  const weightTrendData = useMemo(() => {
    const sorted = [...bodyMetricsList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-10);
    return sorted.map(m => {
      const d = new Date(m.date);
      return {
        dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
        '体重 (kg)': m.weight
      };
    });
  }, [bodyMetricsList]);

  return (
    <div style={{ padding: '20px' }}>
      {/* 顶部标题与快捷工具 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={24} color="var(--primary-color)" /> 数据统计
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button aria-label="切换明暗主题" title="切换明暗主题" onClick={() => setTheme(v => v === 'dark' ? 'light' : 'dark')} style={iconButtonStyle}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button aria-label="导出数据" title="导出数据" onClick={downloadBackup} style={iconButtonStyle}>
            <Download size={17} />
          </button>
          <label aria-label="导入数据" title="导入数据" style={{ ...iconButtonStyle, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <Upload size={17} />
            <input type="file" accept="application/json" hidden onChange={e => handleRestore(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {/* 【核心概览看板】4项关键数据一目了然 */}
      <div style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', opacity: 0.65, marginBottom: '2px' }}>累计训练</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
              {coreStats.totalCount} <span style={{ fontSize: '12px' }}>次</span>
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', opacity: 0.65, marginBottom: '2px' }}>累计总容量</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--success-color)' }}>
              {coreStats.totalVolumeKg >= 10000 
                ? `${(coreStats.totalVolumeKg / 1000).toFixed(1)} 吨` 
                : `${coreStats.totalVolumeKg.toLocaleString()} kg`}
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', opacity: 0.65, marginBottom: '2px' }}>总训练用时</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {coreStats.totalHours} <span style={{ fontSize: '12px' }}>小时</span>
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', opacity: 0.65, marginBottom: '2px' }}>当前体重</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {coreStats.bodyWeight} <span style={{ fontSize: '12px' }}>kg</span>
            </div>
          </div>
        </div>
      </div>

      {/* 【训练出勤墙】 */}
      <div style={{
        backgroundColor: 'var(--surface-color)',
        padding: '16px',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Flame size={18} color="#f97316" /> 训练出勤打卡 (近 18 周)
          </h3>
          <span style={{ fontSize: '11px', opacity: 0.6 }}>出勤天数: {Object.keys(heatmapData.counts).length} 天</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '88px', fontSize: '10px', opacity: 0.6, marginRight: '8px', textAlign: 'right', flexShrink: 0 }}>
            <span>日</span><span>二</span><span>四</span><span>六</span>
          </div>
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
              const isFuture = day.getTime() > new Date().setHours(23, 59, 59, 999);
              
              let bgColor = 'var(--bg-color)';
              if (cnt === 1) bgColor = 'rgba(37, 99, 235, 0.45)';
              else if (cnt >= 2) bgColor = 'var(--primary-color)';

              const readableDate = `${day.getMonth() + 1}月${day.getDate()}日`;
              return (
                <div 
                  key={idx}
                  title={isFuture ? undefined : `${readableDate}: ${cnt} 次训练`}
                  style={{
                    width: '10px', height: '10px', borderRadius: '2px',
                    backgroundColor: isFuture ? 'transparent' : bgColor
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 【力量进阶与容量趋势】 */}
      <div style={{
        backgroundColor: 'var(--surface-color)',
        padding: '16px',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px'
      }}>
        {/* 切换 Tab */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', backgroundColor: 'var(--bg-color)', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setChartType('1rm')}
            style={{
              flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
              backgroundColor: chartType === '1rm' ? 'var(--primary-color)' : 'transparent',
              color: chartType === '1rm' ? '#fff' : 'var(--text-color)',
              fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px'
            }}
          >
            <TrendingUp size={15} /> 力量估算 (1RM)
          </button>
          <button
            onClick={() => setChartType('volume')}
            style={{
              flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
              backgroundColor: chartType === 'volume' ? 'var(--primary-color)' : 'transparent',
              color: chartType === 'volume' ? '#fff' : 'var(--text-color)',
              fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px'
            }}
          >
            <Zap size={15} /> 训练容量 (Volume)
          </button>
        </div>

        {/* 1RM 动作选择器 */}
        {chartType === '1rm' && (
          <div style={{ marginBottom: '14px' }}>
            <select
              value={activeExerciseId}
              onChange={(e) => setSelectedExerciseId(Number(e.target.value))}
              style={{
                width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px',
                border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)',
                color: 'var(--text-color)', outline: 'none'
              }}
            >
              {strengthExercisesWithData.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 图表绘制 */}
        {chartType === '1rm' ? (
          oneRepMaxData.length > 0 ? (
            <div style={{ width: '100%', height: '190px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oneRepMaxData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }} axisLine={false} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="1RM (kg)" stroke="var(--primary-color)" strokeWidth={3} dot={{ fill: 'var(--primary-color)', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '13px', margin: '30px 0' }}>
              {selectedExObj ? `暂无 ${selectedExObj.name} 的正式组数据，去完成一组后即可查看！` : '暂无动作数据'}
            </p>
          )
        ) : (
          volumeChartData.length > 0 ? (
            <div style={{ width: '100%', height: '190px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-color)', fontSize: 11, opacity: 0.7 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <Bar dataKey="训练容量 (kg)" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ opacity: 0.6, textAlign: 'center', fontSize: '13px', margin: '30px 0' }}>完成训练后自动展示最近 7 次容量变化。</p>
          )
        )}
      </div>

      {/* 【极简体重记录与趋势】 */}
      <div style={{
        backgroundColor: 'var(--surface-color)',
        padding: '16px',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Scale size={18} color="var(--primary-color)" /> 体重记录
          </h3>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>当前: <strong>{bodyWeight} kg</strong></span>
        </div>

        {/* 极简一行快速记体重 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input
            type="number"
            step="0.1"
            placeholder="输入今日体重 (kg)"
            value={inputWeight}
            onChange={e => setInputWeight(e.target.value)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)',
              color: 'var(--text-color)', fontSize: '14px', outline: 'none'
            }}
          />
          <button
            onClick={handleSaveWeight}
            style={{
              padding: '10px 18px', backgroundColor: 'var(--primary-color)', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer'
            }}
          >
            保存打卡
          </button>
        </div>

        {/* 体重走势小折线 */}
        {weightTrendData.length > 1 && (
          <div style={{ width: '100%', height: '140px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightTrendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-color)', fontSize: 10, opacity: 0.6 }} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-color)', fontSize: 10, opacity: 0.6 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="体重 (kg)" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 【训练历史流水】 */}
      <div>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '16px' }}>训练历史</h3>
        {(!sessions || sessions.length === 0) ? (
          <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '30px', fontSize: '14px' }}>暂无训练记录，快去流汗吧！</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}

const iconButtonStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: '7px',
  padding: '7px',
  background: 'var(--surface-color)',
  color: 'var(--text-color)',
  cursor: 'pointer'
};
