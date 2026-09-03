import { Award } from 'lucide-react';

export interface WorkoutSummaryData {
  durationMinutes: number;
  totalVolumeKg: number;
  totalSets: number;
  completedExercisesCount: number;
  totalExercisesCount: number;
  newPrs: { exerciseName: string; weight: number; reps: number; estimated1RM: number }[];
}

export function WorkoutSummaryModal({ data, onClose }: { data: WorkoutSummaryData; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', backdropFilter: 'blur(6px)'
    }}>
      <div style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: '20px',
        padding: '24px',
        width: '100%',
        maxWidth: '360px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        border: '1px solid var(--border-color)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '42px', marginBottom: '8px' }}>🎉</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '22px' }}>今日训练圆满完成！</h2>
        <p style={{ margin: '0 0 20px', fontSize: '13px', opacity: 0.65 }}>每一滴汗水都在塑造更强大的你</p>

        {/* 核心战报指标 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '18px' }}>
          <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '12px' }}>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>训练时长</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px', color: 'var(--primary-color)' }}>
              {data.durationMinutes} <span style={{ fontSize: '12px' }}>分钟</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '12px' }}>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>累计训练容量</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px', color: 'var(--success-color)' }}>
              {data.totalVolumeKg.toLocaleString()} <span style={{ fontSize: '12px' }}>kg</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '12px' }}>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>完成总组数</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
              {data.totalSets} <span style={{ fontSize: '12px' }}>组</span>
            </div>
          </div>
          <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '12px' }}>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>动作达标数</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
              {data.completedExercisesCount}/{data.totalExercisesCount}
            </div>
          </div>
        </div>

        {/* 突破纪录彩蛋 */}
        {data.newPrs.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
              <Award size={16} />
              <span>🔥 达成全新个人纪录 (PR)！</span>
            </div>
            {data.newPrs.map(pr => (
              <div key={pr.exerciseName} style={{ fontSize: '12px', marginTop: '4px' }}>
                • <strong>{pr.exerciseName}</strong>：{pr.weight}kg × {pr.reps}次 (推测1RM达 <strong>{pr.estimated1RM}kg</strong>)
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            backgroundColor: 'var(--primary-color)', color: '#fff',
            border: 'none', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}
        >
          太棒了，完成！
        </button>
      </div>
    </div>
  );
}
