import { useState } from 'react';
import { calculateBarbellPlates } from '../domain/fitness';

export function PlateCalculatorModal({ weight, onClose }: { weight: number; onClose: () => void }) {
  const [barWeight, setBarWeight] = useState(20);
  const result = calculateBarbellPlates(weight, barWeight);

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
        maxWidth: '340px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '17px' }}>🧮 杠铃片速算器</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-color)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <div style={{ marginBottom: '14px', textAlign: 'center', padding: '10px', background: 'var(--bg-color)', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>目标总重</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--primary-color)' }}>{weight} <span style={{ fontSize: '16px' }}>kg</span></div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '6px' }}>杠铃杆重量</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[{ label: '标准奥杆 20kg', val: 20 }, { label: '短杆/女杆 15kg', val: 15 }].map(bar => (
              <button
                key={bar.val}
                onClick={() => setBarWeight(bar.val)}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: '8px', fontSize: '12px',
                  border: `1px solid ${barWeight === bar.val ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  background: barWeight === bar.val ? 'var(--primary-color)' : 'transparent',
                  color: barWeight === bar.val ? '#fff' : 'var(--text-color)',
                  cursor: 'pointer'
                }}
              >
                {bar.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>单侧需要挂片：</span>
            <span style={{ color: 'var(--primary-color)' }}>{result.perSideWeight} kg</span>
          </div>

          {result.plates.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {result.plates.map(p => (
                <div key={p.weight} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', borderRadius: '8px', background: 'var(--bg-color)',
                  border: '1px solid var(--border-color)', fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      backgroundColor: p.weight >= 20 ? '#3b82f6' : p.weight >= 10 ? '#10b981' : p.weight >= 5 ? '#f59e0b' : '#ef4444'
                    }} />
                    <span><strong>{p.weight} kg</strong> 片</span>
                  </div>
                  <span style={{ fontWeight: 'bold' }}>单侧挂 {p.count} 片 (两侧共{p.count * 2}片)</span>
                </div>
              ))}
              {result.remainder > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--danger-color)', marginTop: '4px' }}>
                  ⚠️ 单侧仍余 {result.remainder}kg 无法被常规杠铃片整除
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px', opacity: 0.6, fontSize: '13px' }}>
              {weight <= barWeight ? '总重小于或等于杠铃杆本身，无需加片。' : '无需挂片'}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px',
            backgroundColor: 'var(--primary-color)', color: '#fff',
            border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
          }}
        >
          知道了
        </button>
      </div>
    </div>
  );
}
