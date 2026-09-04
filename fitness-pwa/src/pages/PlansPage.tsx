import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exerciseDefaults, type Exercise, type PlannedExercise, type WorkoutTemplate } from '../db';
import { TechniqueCueModal } from '../components/TechniqueCueModal';
import { Plus, Check, Dumbbell, Calendar as CalendarIcon, Edit2, Trash2, Copy, ArrowUp, ArrowDown, Play, Info } from 'lucide-react';

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MUSCLE_GROUPS = ['全部', '胸部', '背部', '腿部', '肩部', '手臂', '核心', '有氧'];

function makeDefaultPlan(exercise: Exercise | undefined, order: number): PlannedExercise {
  const mode = exercise?.recordingMode || (exercise?.type === 'cardio' ? 'distance_time' : 'weight_reps');
  return {
    exerciseId: exercise?.id || 0,
    order,
    targetSets: mode === 'distance_time' || mode === 'time_level' || mode === 'swim' || mode === 'interval' ? 1 : 3,
    minReps: 8,
    maxReps: 12,
    targetRpe: 8,
    restSeconds: mode === 'distance_time' || mode === 'time_level' || mode === 'swim' ? 0 : 90,
    targetDurationSeconds: mode === 'timed_hold' ? 60 : mode === 'distance_time' || mode === 'time_level' || mode === 'swim' ? 1200 : undefined,
    targetDistanceMeters: mode === 'distance_time' ? 3000 : mode === 'swim' ? 1000 : undefined,
    targetLevel: mode === 'time_level' ? 5 : undefined
  };
}

export function PlansPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'templates' | 'library'>('templates');
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [exercisePlans, setExercisePlans] = useState<Record<number, PlannedExercise>>({});

  // 动作筛选与检索状态
  const [muscleFilter, setMuscleFilter] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewCueExercise, setViewCueExercise] = useState<Exercise | null>(null);

  // 自定义动作表单状态
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('胸部');
  const [customType, setCustomType] = useState<'strength' | 'cardio'>('strength');
  const [customMode, setCustomMode] = useState<Exercise['recordingMode']>('weight_reps');
  const [customEquipment, setCustomEquipment] = useState('');
  const [customMovement, setCustomMovement] = useState('');

  const allExercisesQuery = useLiveQuery(() => db.exercises.toArray());
  const exercises = useMemo(() => allExercisesQuery || [], [allExercisesQuery]);
  const templates = useLiveQuery(() => db.workoutTemplates.toArray()) || [];
  const profile = useLiveQuery(() => db.userProfiles.get('current'));

  // 快捷一键开练
  const handleStartWorkoutFromTemplate = async (templateId: number) => {
    const latest = await db.workoutSessions.orderBy('startTime').last();
    if (latest && !latest.endTime) {
      if (confirm('当前已有进行中的训练，是否直接前往训练界面继续？')) {
        navigate('/');
        return;
      }
    }
    await db.workoutSessions.add({
      templateId,
      startTime: new Date(),
      notes: '',
      bodyWeight: profile?.weight
    });
    navigate('/');
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('请输入模板名称');
      return;
    }
    if (selectedExerciseIds.length === 0) {
      alert('请至少选择一个动作');
      return;
    }

    const plannedExercises = selectedExerciseIds.map((exerciseId, order) => ({
      ...(exercisePlans[exerciseId] || makeDefaultPlan(exercises.find(item => item.id === exerciseId), order)),
      exerciseId,
      order
    }));
    if (plannedExercises.some(item => item.minReps > item.maxReps || (item.targetRpe !== undefined && (item.targetRpe < 5 || item.targetRpe > 10)))) {
      alert('请检查计划参数：最低次数不能超过最高次数，目标 RPE 应为 5-10');
      return;
    }

    if (editingTemplateId) {
      await db.workoutTemplates.update(editingTemplateId, {
        name: newTemplateName.trim(),
        exerciseIds: selectedExerciseIds,
        scheduledDays: selectedDays,
        exercises: plannedExercises,
      });
    } else {
      await db.workoutTemplates.add({
        name: newTemplateName.trim(),
        exerciseIds: selectedExerciseIds,
        scheduledDays: selectedDays,
        exercises: plannedExercises,
      });
    }

    setIsCreating(false);
    setEditingTemplateId(null);
    setNewTemplateName('');
    setSelectedExerciseIds([]);
    setSelectedDays([]);
    setExercisePlans({});
  };

  const handleEditTemplate = (tpl: WorkoutTemplate) => {
    setEditingTemplateId(tpl.id!);
    setNewTemplateName(tpl.name);
    setSelectedExerciseIds(tpl.exerciseIds);
    setSelectedDays(tpl.scheduledDays || []);
    setExercisePlans(Object.fromEntries((tpl.exercises || tpl.exerciseIds.map((exerciseId, order) => makeDefaultPlan(exercises.find(item => item.id === exerciseId), order))).map(item => [item.exerciseId, item])));
    setIsCreating(true);
  };

  const handleDeleteTemplate = async (id: number) => {
    if (confirm('确定要删除这个计划模板吗？')) {
      await db.workoutTemplates.delete(id);
    }
  };

  const toggleExerciseSelection = (id: number) => {
    setSelectedExerciseIds(prev => {
      if (prev.includes(id)) {
        setExercisePlans(plans => {
          const next = { ...plans };
          delete next[id];
          return next;
        });
        return prev.filter(eId => eId !== id);
      }
      setExercisePlans(plans => ({ ...plans, [id]: makeDefaultPlan(exercises.find(item => item.id === id), prev.length) }));
      return [...prev, id];
    });
  };

  const updatePlan = (id: number, patch: Partial<PlannedExercise>) => {
    setExercisePlans(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const moveExercise = (id: number, direction: -1 | 1) => {
    setSelectedExerciseIds(prev => {
      const from = prev.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplate) => {
    await db.workoutTemplates.add({ ...tpl, id: undefined, name: `${tpl.name}（副本）` });
  };

  const handleAddExercise = async () => {
    if (!customName.trim() || exercises.some(exercise => exercise.name === customName.trim())) {
      alert('请输入不重复的动作名称');
      return;
    }
    const seed = { name: customName.trim(), muscleGroup: customMuscle.trim() || '胸部', description: '自定义动作', type: customType } as Exercise;
    await db.exercises.add({
      ...seed,
      ...exerciseDefaults(seed),
      recordingMode: customMode,
      equipment: customEquipment.trim() || undefined,
      movementPattern: customMovement.trim() || undefined,
      isCustom: true
    });
    setCustomName('');
    setIsAddingExercise(false);
  };

  const toggleDaySelection = (dayIndex: number) => {
    setSelectedDays(prev => 
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  };

  // 动作过滤逻辑（已选置顶，其余按肌群与搜索词过滤）
  const filteredExercisesForPicker = useMemo(() => {
    return [...exercises].filter(ex => {
      // 已选动作始终展示
      if (selectedExerciseIds.includes(ex.id!)) return true;

      // 搜索关键词筛选
      if (searchTerm.trim() && !ex.name.toLowerCase().includes(searchTerm.trim().toLowerCase())) {
        return false;
      }

      // 肌群筛选
      if (muscleFilter === '全部') return true;
      if (muscleFilter === '有氧') return ex.type === 'cardio' || ex.muscleGroup.includes('有氧');
      return ex.muscleGroup.includes(muscleFilter) || ex.primaryMuscles?.some(m => m.includes(muscleFilter));
    }).sort((a, b) => {
      const ai = selectedExerciseIds.indexOf(a.id!);
      const bi = selectedExerciseIds.indexOf(b.id!);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [exercises, selectedExerciseIds, searchTerm, muscleFilter]);

  // 动作库标签下的筛选逻辑
  const filteredLibraryExercises = useMemo(() => {
    return exercises.filter(ex => {
      if (searchTerm.trim() && !ex.name.toLowerCase().includes(searchTerm.trim().toLowerCase())) {
        return false;
      }
      if (muscleFilter === '全部') return true;
      if (muscleFilter === '有氧') return ex.type === 'cardio' || ex.muscleGroup.includes('有氧');
      return ex.muscleGroup.includes(muscleFilter) || ex.primaryMuscles?.some(m => m.includes(muscleFilter));
    });
  }, [exercises, searchTerm, muscleFilter]);

  return (
    <div style={{ padding: '20px' }}>
      {/* 顶部 Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button 
          onClick={() => { setActiveTab('templates'); setSearchTerm(''); setMuscleFilter('全部'); }}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
            fontWeight: 'bold', fontSize: '16px',
            backgroundColor: activeTab === 'templates' ? 'var(--primary-color)' : 'var(--surface-color)',
            color: activeTab === 'templates' ? '#fff' : 'var(--text-color)',
            cursor: 'pointer'
          }}>
          我的计划
        </button>
        <button 
          onClick={() => { setActiveTab('library'); setSearchTerm(''); setMuscleFilter('全部'); }}
          style={{
            flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
            fontWeight: 'bold', fontSize: '16px',
            backgroundColor: activeTab === 'library' ? 'var(--primary-color)' : 'var(--surface-color)',
            color: activeTab === 'library' ? '#fff' : 'var(--text-color)',
            cursor: 'pointer'
          }}>
          动作库
        </button>
      </div>

      {activeTab === 'templates' && (
        <div>
          {!isCreating ? (
            <>
              <button 
                onClick={() => { setIsCreating(true); setSearchTerm(''); setMuscleFilter('全部'); }}
                style={{
                  width: '100%', padding: '16px', borderRadius: '12px', border: '2px dashed var(--primary-color)',
                  backgroundColor: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '16px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  marginBottom: '24px'
                }}>
                <Plus size={20} /> 创建新计划模板
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {templates.length === 0 ? (
                  <p style={{ textAlign: 'center', opacity: 0.6, marginTop: '20px' }}>暂无计划，点击上方创建！</p>
                ) : (
                  templates.map(tpl => (
                    <div key={tpl.id} style={{
                      padding: '16px', backgroundColor: 'var(--surface-color)',
                      borderRadius: '12px', border: '1px solid var(--border-color)',
                      display: 'flex', flexDirection: 'column', gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Dumbbell size={18} color="var(--primary-color)"/> {tpl.name}
                          </h3>
                          
                          {tpl.scheduledDays && tpl.scheduledDays.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--primary-color)' }}>
                              <CalendarIcon size={13} /> 
                              计划于：{tpl.scheduledDays.map(d => WEEK_DAYS[d]).join('、')}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button aria-label="复制计划" onClick={() => handleDuplicateTemplate(tpl)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '4px' }}>
                            <Copy size={17} />
                          </button>
                          <button onClick={() => handleEditTemplate(tpl)} style={{ background: 'none', border: 'none', color: 'var(--text-color)', opacity: 0.6, cursor: 'pointer', padding: '4px' }}>
                            <Edit2 size={17} />
                          </button>
                          <button onClick={() => handleDeleteTemplate(tpl.id!)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', opacity: 0.8, cursor: 'pointer', padding: '4px' }}>
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', opacity: 0.75, lineHeight: 1.4 }}>
                        {tpl.exerciseIds.map(id => exercises.find(e => e.id === id)?.name).filter(Boolean).join(' · ')}
                      </div>

                      {/* 卡片底部：包含动作统计与绿色一键开练按钮 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                        <span style={{ fontSize: '12px', opacity: 0.6 }}>包含 {tpl.exerciseIds.length} 个动作</span>
                        <button
                          onClick={() => handleStartWorkoutFromTemplate(tpl.id!)}
                          style={{
                            padding: '7px 14px', borderRadius: '8px', border: 'none',
                            backgroundColor: 'var(--success-color)', color: '#fff',
                            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          <Play size={14} fill="#fff" /> 开始训练
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div style={{ backgroundColor: 'var(--surface-color)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{editingTemplateId ? '编辑计划' : '创建新计划'}</h3>
              
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>计划名称</label>
              <input 
                type="text" 
                placeholder="例如：推拉腿 - 练腿日" 
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                style={{
                  width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px', 
                  border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-color)',
                  marginBottom: '20px'
                }}
              />

              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>排表 (可选)</h4>
              <p style={{ fontSize: '12px', opacity: 0.6, margin: '0 0 12px 0' }}>选择将此计划安排在星期几</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {WEEK_DAYS.map((day, idx) => {
                  const isSelected = selectedDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDaySelection(idx)}
                      style={{
                        padding: '6px 12px', borderRadius: '20px', border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                        backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--bg-color)',
                        color: isSelected ? '#fff' : 'var(--text-color)', fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              
              {/* 动作添加区域 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '14px' }}>包含动作 ({selectedExerciseIds.length})</h4>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>勾选添加，已选动作置顶</span>
              </div>

              {/* 搜索与肌群筛选栏 */}
              <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="🔍 搜索动作名称..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-color)', fontSize: '13px', outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {MUSCLE_GROUPS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMuscleFilter(m)}
                      style={{
                        padding: '4px 10px', borderRadius: '14px', fontSize: '12px', flexShrink: 0,
                        border: `1px solid ${muscleFilter === m ? 'var(--primary-color)' : 'var(--border-color)'}`,
                        background: muscleFilter === m ? 'var(--primary-color)' : 'var(--bg-color)',
                        color: muscleFilter === m ? '#fff' : 'var(--text-color)',
                        cursor: 'pointer'
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 动作列表 */}
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {filteredExercisesForPicker.length === 0 ? (
                  <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '13px', margin: '20px 0' }}>未找到匹配动作</p>
                ) : (
                  filteredExercisesForPicker.map(ex => {
                    const isSelected = selectedExerciseIds.includes(ex.id!);
                    const plan = exercisePlans[ex.id!];
                    const mode = ex.recordingMode || (ex.type === 'cardio' ? 'distance_time' : 'weight_reps');
                    return (
                      <div 
                        key={ex.id} 
                        style={{
                          display: 'flex', flexDirection: 'column', gap: '10px',
                          padding: '12px', borderRadius: '8px', border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                          backgroundColor: isSelected ? 'var(--primary-active)' : 'var(--bg-color)',
                          color: isSelected ? '#fff' : 'var(--text-color)', cursor: 'pointer'
                        }}>
                        <div onClick={() => toggleExerciseSelection(ex.id!)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{ex.name}</span>
                            <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '6px' }}>({ex.muscleGroup})</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewCueExercise(ex);
                              }}
                              style={{
                                marginLeft: '6px', background: 'none', border: 'none',
                                color: isSelected ? '#fff' : 'var(--primary-color)',
                                cursor: 'pointer', padding: '0 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', opacity: 0.9
                              }}
                              title="查看动作要领"
                            >
                              <Info size={13} /> 要领
                            </button>
                          </div>
                          {isSelected && <Check size={18} />}
                        </div>
                        {isSelected && plan && (
                          <div onClick={event => event.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))', gap: '6px', color: '#fff' }}>
                            <PlanNumber label="组" value={plan.targetSets} onChange={value => updatePlan(ex.id!, { targetSets: value })} />
                            {(mode === 'weight_reps' || mode === 'bodyweight_reps') && <>
                              <PlanNumber label="最低次数" value={plan.minReps} onChange={value => updatePlan(ex.id!, { minReps: value })} />
                              <PlanNumber label="最高次数" value={plan.maxReps} onChange={value => updatePlan(ex.id!, { maxReps: value })} />
                              <PlanNumber label="目标重量" value={plan.targetWeight || 0} min={0} onChange={value => updatePlan(ex.id!, { targetWeight: value })} />
                            </>}
                            {(mode === 'timed_hold' || mode === 'distance_time' || mode === 'time_level' || mode === 'swim') && (
                              <PlanNumber label="目标分钟" value={Math.round((plan.targetDurationSeconds || 0) / 60)} min={0} onChange={value => updatePlan(ex.id!, { targetDurationSeconds: value * 60 })} />
                            )}
                            {mode === 'distance_time' && (
                              <PlanNumber label="目标公里" value={(plan.targetDistanceMeters || 0) / 1000} min={0} step={0.1} onChange={value => updatePlan(ex.id!, { targetDistanceMeters: Math.round(value * 1000) })} />
                            )}
                            {mode === 'swim' && <PlanNumber label="目标米数" value={plan.targetDistanceMeters || 0} min={0} step={25} onChange={value => updatePlan(ex.id!, { targetDistanceMeters: value })} />}
                            {mode === 'time_level' && <PlanNumber label="目标等级" value={plan.targetLevel || 0} min={0} onChange={value => updatePlan(ex.id!, { targetLevel: value })} />}
                            <PlanNumber label="RPE" value={plan.targetRpe || 8} onChange={value => updatePlan(ex.id!, { targetRpe: value })} />
                            <PlanNumber label="休息秒" value={plan.restSeconds} min={0} onChange={value => updatePlan(ex.id!, { restSeconds: value })} />
                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button aria-label="上移动作" onClick={() => moveExercise(ex.id!, -1)}><ArrowUp size={16} /></button>
                              <button aria-label="下移动作" onClick={() => moveExercise(ex.id!, 1)}><ArrowDown size={16} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => {
                    setIsCreating(false);
                    setEditingTemplateId(null);
                    setNewTemplateName('');
                    setSelectedExerciseIds([]);
                    setSelectedDays([]);
                    setExercisePlans({});
                  }}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-color)', cursor: 'pointer' }}
                >
                  取消
                </button>
                <button 
                  onClick={handleSaveTemplate}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary-color)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  保存计划
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 搜索与肌群筛选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="🔍 搜索动作库..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)',
                color: 'var(--text-color)', fontSize: '13px', outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {MUSCLE_GROUPS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMuscleFilter(m)}
                  style={{
                    padding: '4px 10px', borderRadius: '14px', fontSize: '12px', flexShrink: 0,
                    border: `1px solid ${muscleFilter === m ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    background: muscleFilter === m ? 'var(--primary-color)' : 'var(--surface-color)',
                    color: muscleFilter === m ? '#fff' : 'var(--text-color)',
                    cursor: 'pointer'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setIsAddingExercise(value => !value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px dashed var(--primary-color)', background: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', cursor: 'pointer' }}>
            <Plus size={17} style={{ verticalAlign: 'middle' }} /> 自定义动作
          </button>
          {isAddingExercise && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', padding: '12px', background: 'var(--surface-color)', borderRadius: '10px' }}>
              <input placeholder="动作名称" value={customName} onChange={event => setCustomName(event.target.value)} style={libraryInputStyle} />
              <input placeholder="主要肌群" value={customMuscle} onChange={event => setCustomMuscle(event.target.value)} style={libraryInputStyle} />
              <select value={customType} onChange={event => { const type = event.target.value as 'strength' | 'cardio'; setCustomType(type); setCustomMode(type === 'cardio' ? 'distance_time' : 'weight_reps'); }} style={libraryInputStyle}><option value="strength">力量/技能</option><option value="cardio">有氧</option></select>
              <select value={customMode} onChange={event => setCustomMode(event.target.value as Exercise['recordingMode'])} style={libraryInputStyle}>
                <option value="weight_reps">重量+次数</option><option value="bodyweight_reps">自重+次数</option><option value="timed_hold">静态保持</option><option value="distance_time">距离+时间</option><option value="time_level">时间+等级</option><option value="swim">游泳</option><option value="interval">间歇</option>
              </select>
              <input placeholder="器械，例如：哑铃" value={customEquipment} onChange={event => setCustomEquipment(event.target.value)} style={libraryInputStyle} />
              <input placeholder="动作模式，例如：水平推" value={customMovement} onChange={event => setCustomMovement(event.target.value)} style={libraryInputStyle} />
              <button onClick={() => setIsAddingExercise(false)} style={{ padding: '10px', border: 'none', borderRadius: '7px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleAddExercise} style={{ padding: '10px', border: 'none', borderRadius: '7px', background: 'var(--primary-color)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>保存动作</button>
            </div>
          )}
          {filteredLibraryExercises.map((ex) => (
            <div key={ex.id} style={{
              padding: '16px',
              backgroundColor: 'var(--surface-color)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{ex.name}</h3>
                <button
                  type="button"
                  onClick={() => setViewCueExercise(ex)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--primary-color)',
                    background: 'rgba(37, 99, 235, 0.08)', color: 'var(--primary-color)',
                    fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  <Info size={14} /> 动作要领
                </button>
              </div>
              <div style={{
                display: 'inline-block', padding: '3px 8px', backgroundColor: 'var(--primary-color)',
                color: '#fff', borderRadius: '4px', fontSize: '11px', marginBottom: '8px'
              }}>
                {ex.muscleGroup}
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-color)', opacity: 0.8 }}>
                {ex.description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', opacity: 0.65 }}>
                <span>{ex.equipment || '通用'} · {ex.movementPattern || ex.recordingMode}</span>
                {ex.isCustom && <button aria-label={`删除${ex.name}`} onClick={() => confirm('删除自定义动作会让已有历史显示为未知动作，确定继续吗？') && db.exercises.delete(ex.id!)} style={{ border: 'none', background: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 动作要领弹窗 */}
      {viewCueExercise && (
        <TechniqueCueModal exercise={viewCueExercise} onClose={() => setViewCueExercise(null)} />
      )}
    </div>
  );
}

const libraryInputStyle = {
  minWidth: 0,
  width: '100%',
  padding: '9px',
  borderRadius: '7px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-color)',
  color: 'var(--text-color)'
};

function PlanNumber({ label, value, onChange, min = 1, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={event => onChange(Math.max(min, Number(event.target.value) || min))}
        style={{ width: '100%', minWidth: 0, padding: '5px', borderRadius: '5px', border: 'none' }}
      />
    </label>
  );
}
