import React, { useState } from 'react';
import { db, exerciseDefaults, type Exercise } from '../db';
import { X, Dumbbell, Save } from 'lucide-react';

interface CustomExerciseModalProps {
  exercise?: Exercise | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (exercise: Exercise) => void;
}

const MUSCLE_GROUPS = ['胸部', '背部', '腿部', '臀部', '肩部', '手臂', '核心', '小腿', '有氧心肺', '全身'];

const RECORDING_MODES = [
  { value: 'weight_reps', label: '负重次数', desc: '按重量(kg) × 次数，如杠铃卧推、哑铃推举' },
  { value: 'bodyweight_reps', label: '自重次数', desc: '按自重/加重 × 次数，如引体向上、俯卧撑、悬垂举腿' },
  { value: 'timed_hold', label: '静态计时', desc: '按时长(秒)，如平板支撑、靠墙静蹲、死挂悬垂' },
  { value: 'distance_time', label: '有氧心肺', desc: '按用时(分钟)与距离(km)，如跑步、单车、划船' }
] as const;

const EQUIPMENT_OPTIONS = ['杠铃', '哑铃', '绳索器械', '固定器械', '自重/通用', '有氧器械'];

function CustomExerciseModalContent({
  exercise,
  onClose,
  onSaved
}: {
  exercise?: Exercise | null;
  onClose: () => void;
  onSaved?: (exercise: Exercise) => void;
}) {
  const isEditing = Boolean(exercise?.id);

  const [name, setName] = useState(exercise?.name || '');
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscleGroup || '胸部');
  const [recordingMode, setRecordingMode] = useState<Exercise['recordingMode']>(
    exercise?.recordingMode || (exercise?.type === 'cardio' ? 'distance_time' : 'weight_reps')
  );
  const [equipment, setEquipment] = useState(
    exercise?.equipment || (exercise?.type === 'cardio' ? '有氧器械' : '杠铃')
  );
  const [description, setDescription] = useState(
    exercise?.description && exercise.description !== '自定义动作' ? exercise.description : ''
  );
  const [note, setNote] = useState(exercise?.note || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleModeChange = (newMode: typeof recordingMode) => {
    setRecordingMode(newMode);
    if (newMode === 'distance_time') {
      setEquipment('有氧器械');
      if (muscleGroup !== '有氧心肺') setMuscleGroup('有氧心肺');
    } else if (newMode === 'bodyweight_reps' || newMode === 'timed_hold') {
      if (equipment === '有氧器械' || equipment === '杠铃') {
        setEquipment('自重/通用');
      }
    } else if (newMode === 'weight_reps') {
      if (equipment === '有氧器械' || equipment === '自重/通用') {
        setEquipment('杠铃');
      }
      if (muscleGroup === '有氧心肺') setMuscleGroup('胸部');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      alert('请输入动作名称');
      return;
    }

    try {
      setIsSubmitting(true);
      const allExercises = await db.exercises.toArray();
      const duplicate = allExercises.find(
        ex => ex.name.trim().toLowerCase() === cleanName.toLowerCase() && ex.id !== exercise?.id
      );
      if (duplicate) {
        alert(`已存在名称为“${cleanName}”的动作，请使用其他名称`);
        setIsSubmitting(false);
        return;
      }

      const isCardio = recordingMode === 'distance_time';
      const isTimed = recordingMode === 'timed_hold';
      const isBodyweight = recordingMode === 'bodyweight_reps';

      const seedData: Partial<Exercise> = {
        name: cleanName,
        muscleGroup,
        type: isCardio ? 'cardio' : 'strength',
        recordingMode,
        equipment,
        description: description.trim() || '自定义动作',
        note: note.trim() || undefined,
        loadType: isBodyweight || isTimed ? 'bodyweight-added' : 'external',
        countInVolume: !isCardio && !isTimed,
        supports1RM: !isCardio && !isTimed && (equipment === '杠铃' || equipment === '哑铃' || cleanName.includes('引体') || cleanName.includes('双杠')),
        isCustom: true
      };

      const defaults = exerciseDefaults(seedData as Exercise);
      const mergedExercise: Exercise = {
        ...defaults,
        ...seedData
      } as Exercise;

      if (isEditing && exercise?.id) {
        await db.exercises.put({ ...mergedExercise, id: exercise.id });
        onSaved?.({ ...mergedExercise, id: exercise.id });
      } else {
        const id = await db.exercises.add(mergedExercise);
        onSaved?.({ ...mergedExercise, id: Number(id) });
      }

      onClose();
    } catch (err) {
      console.error('Failed to save custom exercise:', err);
      alert('保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: '16px',
        padding: '20px',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-color)'
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--primary-color)'
            }}>
              <Dumbbell size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold' }}>
                {isEditing ? '编辑自定义动作' : '添加自定义动作'}
              </h3>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>完善动作细节，更精准贴合您的训练习惯</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: 'var(--text-color)', cursor: 'pointer', padding: '4px', display: 'flex', opacity: 0.7 }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 动作名称 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
              动作名称 <span style={{ color: 'var(--danger-color)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="例如：上斜哑铃卧推、死挂悬垂"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* 部位与器械（并排） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
                所属部位
              </label>
              <select
                value={muscleGroup}
                onChange={e => setMuscleGroup(e.target.value)}
                style={inputStyle}
              >
                {MUSCLE_GROUPS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
                器械类型
              </label>
              <select
                value={equipment}
                onChange={e => setEquipment(e.target.value)}
                style={inputStyle}
              >
                {EQUIPMENT_OPTIONS.map(eq => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 记录类型选择 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
              记录模式（计数 vs 计时）
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {RECORDING_MODES.map(item => {
                const isSelected = recordingMode === item.value;
                return (
                  <div
                    key={item.value}
                    onClick={() => handleModeChange(item.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-color)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? 'var(--primary-color)' : 'var(--text-color)' }}>
                        {item.label}
                      </span>
                      {isSelected && (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary-color)' }} />
                      )}
                    </div>
                    <span style={{ fontSize: '11px', opacity: 0.65 }}>
                      {item.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 器械孔位 / 档位备忘 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
              器械孔位 / 调节备忘（选填）
            </label>
            <input
              type="text"
              placeholder="例如：座椅高4档，靠背孔位2"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* 动作要领与描述 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
              动作描述 / 发力要领（选填）
            </label>
            <textarea
              rows={2}
              placeholder="记录动作规范、注意事项或发力提示..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* 底部操作按钮 */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'transparent',
                color: 'var(--text-color)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                flex: 1.6, padding: '10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary-color)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              <Save size={16} /> {isEditing ? '保存修改' : '保存动作'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CustomExerciseModal({ exercise, isOpen, onClose, onSaved }: CustomExerciseModalProps) {
  if (!isOpen) return null;
  return (
    <CustomExerciseModalContent
      key={exercise?.id ?? 'new'}
      exercise={exercise}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-color)',
  color: 'var(--text-color)',
  fontSize: '13px',
  boxSizing: 'border-box'
};
