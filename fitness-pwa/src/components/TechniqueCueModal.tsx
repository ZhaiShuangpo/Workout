import { getExerciseCues } from '../domain/fitness';
import { type Exercise } from '../db';
import { X, Lightbulb, CheckCircle2 } from 'lucide-react';

export function TechniqueCueModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const cues = getExerciseCues(exercise);

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
        padding: '22px',
        width: '100%',
        maxWidth: '360px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        {/* 头部标题与肌群标签 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{exercise.name}</h3>
              <span style={{
                fontSize: '11px', backgroundColor: 'var(--primary-color)', color: '#fff',
                padding: '2px 8px', borderRadius: '10px'
              }}>
                {exercise.muscleGroup}
              </span>
            </div>
            {exercise.equipment && (
              <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>
                器械类型：{exercise.equipment}
              </div>
            )}
          </div>
          <button 
            onClick={onClose} 
            style={{ border: 'none', background: 'none', color: 'var(--text-color)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 核心发力与安全要诀 */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '10px' }}>
            <Lightbulb size={16} />
            <span>核心技术要领 & 避坑指南</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cues.map((cue, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                backgroundColor: 'var(--bg-color)', padding: '10px 12px', borderRadius: '10px',
                fontSize: '13px', lineHeight: 1.5, border: '1px solid var(--border-color)'
              }}>
                <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{cue}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 个人器械备忘提示 */}
        {exercise.note && (
          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            padding: '10px 12px',
            marginBottom: '18px',
            fontSize: '12px',
            color: '#d97706'
          }}>
            <strong>📌 你的专属器械备忘：</strong> {exercise.note}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '11px', borderRadius: '10px',
            backgroundColor: 'var(--primary-color)', color: '#fff',
            border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
          }}
        >
          掌握了，开始做组
        </button>
      </div>
    </div>
  );
}
