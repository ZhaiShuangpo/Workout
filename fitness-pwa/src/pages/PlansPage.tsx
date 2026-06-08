import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorkoutTemplate } from '../db';
import { Plus, Check, Dumbbell, Calendar as CalendarIcon, Edit2, Trash2 } from 'lucide-react';

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function PlansPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'library'>('templates');
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const exercises = useLiveQuery(() => db.exercises.toArray()) || [];
  const templates = useLiveQuery(() => db.workoutTemplates.toArray()) || [];

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('请输入模板名称');
      return;
    }
    if (selectedExerciseIds.length === 0) {
      alert('请至少选择一个动作');
      return;
    }

    if (editingTemplateId) {
      await db.workoutTemplates.update(editingTemplateId, {
        name: newTemplateName.trim(),
        exerciseIds: selectedExerciseIds,
        scheduledDays: selectedDays,
      });
    } else {
      await db.workoutTemplates.add({
        name: newTemplateName.trim(),
        exerciseIds: selectedExerciseIds,
        scheduledDays: selectedDays,
      });
    }

    setIsCreating(false);
    setEditingTemplateId(null);
    setNewTemplateName('');
    setSelectedExerciseIds([]);
    setSelectedDays([]);
  };

  const handleEditTemplate = (tpl: WorkoutTemplate) => {
    setEditingTemplateId(tpl.id!);
    setNewTemplateName(tpl.name);
    setSelectedExerciseIds(tpl.exerciseIds);
    setSelectedDays(tpl.scheduledDays || []);
    setIsCreating(true);
  };

  const handleDeleteTemplate = async (id: number) => {
    if (confirm('确定要删除这个计划模板吗？')) {
      await db.workoutTemplates.delete(id);
    }
  };

  const toggleExerciseSelection = (id: number) => {
    setSelectedExerciseIds(prev => 
      prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]
    );
  };

  const toggleDaySelection = (dayIndex: number) => {
    setSelectedDays(prev => 
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* 顶部 Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button 
          onClick={() => setActiveTab('templates')}
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
          onClick={() => setActiveTab('library')}
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
                onClick={() => setIsCreating(true)}
                style={{
                  width: '100%', padding: '16px', borderRadius: '12px', border: '2px dashed var(--primary-color)',
                  backgroundColor: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '16px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  marginBottom: '24px'
                }}>
                <Plus size={20} /> 创建新计划模板
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {templates.length === 0 ? (
                  <p style={{ textAlign: 'center', opacity: 0.6, marginTop: '20px' }}>暂无计划，点击上方创建！</p>
                ) : (
                  templates.map(tpl => (
                    <div key={tpl.id} style={{
                      padding: '16px', backgroundColor: 'var(--surface-color)',
                      borderRadius: '12px', border: '1px solid var(--border-color)',
                      display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Dumbbell size={18} color="var(--primary-color)"/> {tpl.name}
                          </h3>
                          
                          {tpl.scheduledDays && tpl.scheduledDays.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--primary-color)', marginBottom: '8px' }}>
                              <CalendarIcon size={14} /> 
                              计划于：{tpl.scheduledDays.map(d => WEEK_DAYS[d]).join('、')}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleEditTemplate(tpl)} style={{ background: 'none', border: 'none', color: 'var(--text-color)', opacity: 0.6, cursor: 'pointer', padding: '4px' }}>
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDeleteTemplate(tpl.id!)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', opacity: 0.8, cursor: 'pointer', padding: '4px' }}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '14px', opacity: 0.7, lineHeight: 1.5 }}>
                        包含 {tpl.exerciseIds.length} 个动作：
                        {tpl.exerciseIds.map(id => exercises.find(e => e.id === id)?.name).filter(Boolean).join('、')}
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                {WEEK_DAYS.map((day, idx) => {
                  const isSelected = selectedDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDaySelection(idx)}
                      style={{
                        padding: '8px 12px', borderRadius: '20px', border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                        backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--bg-color)',
                        color: isSelected ? '#fff' : 'var(--text-color)', fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>包含动作 ({selectedExerciseIds.length})</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {exercises.map(ex => {
                  const isSelected = selectedExerciseIds.includes(ex.id!);
                  return (
                    <div 
                      key={ex.id} 
                      onClick={() => toggleExerciseSelection(ex.id!)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px', borderRadius: '8px', border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                        backgroundColor: isSelected ? 'var(--primary-active)' : 'var(--bg-color)',
                        color: isSelected ? '#fff' : 'var(--text-color)', cursor: 'pointer'
                      }}>
                      <span>{ex.name} <span style={{ fontSize: '12px', opacity: 0.6, marginLeft: '4px' }}>({ex.muscleGroup})</span></span>
                      {isSelected && <Check size={18} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => {
                    setIsCreating(false);
                    setEditingTemplateId(null);
                    setNewTemplateName('');
                    setSelectedExerciseIds([]);
                    setSelectedDays([]);
                  }}
                  style={{ flex: 1, padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--border-color)', color: 'var(--text-color)', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                  取消
                </button>
                <button 
                  onClick={handleSaveTemplate}
                  style={{ flex: 2, padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary-color)', color: '#fff', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                  保存模板
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {exercises.map((ex) => (
            <div key={ex.id} style={{
              padding: '16px',
              backgroundColor: 'var(--surface-color)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)'
            }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{ex.name}</h3>
              <div style={{
                display: 'inline-block', padding: '4px 8px', backgroundColor: 'var(--primary-color)',
                color: '#fff', borderRadius: '4px', fontSize: '12px', marginBottom: '8px'
              }}>
                {ex.muscleGroup}
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-color)', opacity: 0.8 }}>
                {ex.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
