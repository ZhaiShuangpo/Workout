import { useState, useEffect } from 'react';
import { Calculator, Utensils, Info } from 'lucide-react';

export function NutritionPage() {
  const getInitialState = <T,>(key: string, defaultValue: T): T => {
    const saved = localStorage.getItem('nutrition_profile');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        return data[key] !== undefined ? data[key] : defaultValue;
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  };

  const [gender, setGender] = useState<'male' | 'female'>(() => getInitialState('gender', 'male'));
  const [age, setAge] = useState<number>(() => getInitialState('age', 25));
  const [height, setHeight] = useState<number>(() => getInitialState('height', 175));
  const [weight, setWeight] = useState<number>(() => getInitialState('weight', 70));
  const [activity, setActivity] = useState<number>(() => getInitialState('activity', 1.2));
  const [goal, setGoal] = useState<'cut' | 'maintain' | 'bulk'>(() => getInitialState('goal', 'maintain'));

  // Mifflin-St Jeor Equation
  let bmr = (10 * weight) + (6.25 * height) - (5 * age);
  bmr += gender === 'male' ? 5 : -161;

  const tdee = Math.round(bmr * activity);

  let targetCalories = tdee;
  if (goal === 'cut') targetCalories -= 500;
  if (goal === 'bulk') targetCalories += 300;

  // Basic Macros Rule of Thumb:
  // Protein: ~2g per kg of body weight
  // Fat: ~1g per kg of body weight
  // Carbs: The rest of the calories
  const protein = Math.round(weight * 2);
  const fat = Math.round(weight * 1);
  
  // 1g Protein = 4 kcal, 1g Fat = 9 kcal, 1g Carbs = 4 kcal
  const proteinCal = protein * 4;
  const fatCal = fat * 9;
  let carbs = Math.round((targetCalories - proteinCal - fatCal) / 4);
  if (carbs < 0) carbs = 0; // fallback

  const macros = { protein, fat, carbs };

  // Save to localStorage when inputs change
  useEffect(() => {
    localStorage.setItem('nutrition_profile', JSON.stringify({
      gender, age, height, weight, activity, goal
    }));
  }, [gender, age, height, weight, activity, goal]);

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Utensils size={24} color="var(--primary-color)" /> 
        营养与饮食
      </h2>
      <p style={{ color: 'var(--text-color)', opacity: 0.7, marginBottom: '24px' }}>
        通过计算 TDEE (每日总能量消耗)，科学规划您的三大营养素摄入。
      </p>

      {/* 身体数据表单 */}
      <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '18px' }}>
          <Calculator size={18} /> 身体数据
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>性别</label>
            <select 
              value={gender} onChange={e => setGender(e.target.value as 'male' | 'female')}
              style={inputStyle}
            >
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>年龄</label>
            <input 
              type="number" value={age} onChange={e => setAge(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>身高 (cm)</label>
            <input 
              type="number" value={height} onChange={e => setHeight(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>体重 (kg)</label>
            <input 
              type="number" value={weight} onChange={e => setWeight(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>日常活动量</label>
          <select 
            value={activity} onChange={e => setActivity(Number(e.target.value))}
            style={inputStyle}
          >
            <option value={1.2}>久坐不动 (办公室工作)</option>
            <option value={1.375}>轻度活动 (每周运动 1-3 天)</option>
            <option value={1.55}>中度活动 (每周运动 3-5 天)</option>
            <option value={1.725}>高度活动 (每周运动 6-7 天)</option>
            <option value={1.9}>极度活动 (重体力工作/专业训练)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>当前目标</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setGoal('cut')}
              style={{ ...goalBtnStyle, backgroundColor: goal === 'cut' ? 'var(--primary-color)' : 'var(--bg-color)', color: goal === 'cut' ? '#fff' : 'var(--text-color)' }}>
              减脂 (-500)
            </button>
            <button 
              onClick={() => setGoal('maintain')}
              style={{ ...goalBtnStyle, backgroundColor: goal === 'maintain' ? 'var(--primary-color)' : 'var(--bg-color)', color: goal === 'maintain' ? '#fff' : 'var(--text-color)' }}>
              保持 (0)
            </button>
            <button 
              onClick={() => setGoal('bulk')}
              style={{ ...goalBtnStyle, backgroundColor: goal === 'bulk' ? 'var(--primary-color)' : 'var(--bg-color)', color: goal === 'bulk' ? '#fff' : 'var(--text-color)' }}>
              增肌 (+300)
            </button>
          </div>
        </div>
      </div>

      {/* 计算结果面板 */}
      <div style={{ backgroundColor: 'var(--primary-active)', color: '#fff', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '4px' }}>目标摄入 (kcal/天)</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{targetCalories}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>TDEE (基础代谢+活动)</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{tdee}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <div style={{ flex: macros.protein * 4, height: '8px', backgroundColor: '#34d399', borderRadius: '4px' }} />
          <div style={{ flex: macros.carbs * 4, height: '8px', backgroundColor: '#fcd34d', borderRadius: '4px' }} />
          <div style={{ flex: macros.fat * 9, height: '8px', backgroundColor: '#f87171', borderRadius: '4px' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
          <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: '12px 8px', borderRadius: '8px', marginRight: '8px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8, color: '#34d399' }}>蛋白质</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0' }}>{macros.protein}g</div>
            <div style={{ fontSize: '10px', opacity: 0.6 }}>2g/kg</div>
          </div>
          <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: '12px 8px', borderRadius: '8px', marginRight: '8px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8, color: '#fcd34d' }}>碳水</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0' }}>{macros.carbs}g</div>
            <div style={{ fontSize: '10px', opacity: 0.6 }}>剩余热量</div>
          </div>
          <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: '12px 8px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', opacity: 0.8, color: '#f87171' }}>脂肪</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0' }}>{macros.fat}g</div>
            <div style={{ fontSize: '10px', opacity: 0.6 }}>1g/kg</div>
          </div>
        </div>
      </div>

      {/* 食物等量参考 */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Utensils size={18} color="var(--primary-color)" /> 食物等量参考 (小白指南)
        </h3>
        <p style={{ fontSize: '13px', opacity: 0.7, marginBottom: '16px', lineHeight: 1.5 }}>
          不知道吃什么？以下是满足您单日营养目标的粗略食材重量（生重/未烹饪），您可以将它们自由组合分配到三餐中：
        </p>

        {/* 蛋白质参考 */}
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', color: '#34d399', marginBottom: '8px' }}>🥩 补充 {macros.protein}g 蛋白质，相当于：</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', opacity: 0.8, lineHeight: 1.6 }}>
            <li>吃 <strong>{Math.round(macros.protein / 6)}</strong> 个全蛋 (约6g/个)</li>
            <li>吃 <strong>{Math.round((macros.protein / 23) * 100)}g</strong> 鸡胸肉 (约23g/100g)</li>
            <li>吃 <strong>{Math.round((macros.protein / 20) * 100)}g</strong> 瘦牛肉 (约20g/100g)</li>
            <li>吃 <strong>{Math.round((macros.protein / 18) * 100)}g</strong> 鱼虾海鲜 (约18g/100g)</li>
          </ul>
        </div>

        {/* 碳水参考 */}
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', color: '#fcd34d', marginBottom: '8px' }}>🍚 补充 {macros.carbs}g 碳水，相当于：</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', opacity: 0.8, lineHeight: 1.6 }}>
            <li>吃 <strong>{Math.round((macros.carbs / 26) * 100)}g</strong> 熟米饭 (约26g/100g)</li>
            <li>吃 <strong>{Math.round((macros.carbs / 17) * 100)}g</strong> 蒸红薯/紫薯 (约17g/100g)</li>
            <li>吃 <strong>{Math.round((macros.carbs / 60) * 100)}g</strong> 生燕麦片 (约60g/100g)</li>
          </ul>
        </div>

        {/* 脂肪参考 */}
        <div style={{ backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', color: '#f87171', marginBottom: '8px' }}>🥑 补充 {macros.fat}g 脂肪，相当于：</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', opacity: 0.8, lineHeight: 1.6 }}>
            <li>吃 <strong>{Math.round((macros.fat / 50) * 100)}g</strong> 坚果/杏仁 (约50g/100g)</li>
            <li>吃 <strong>{Math.round((macros.fat / 15) * 100)}g</strong> 牛油果 (约15g/100g)</li>
            <li>使用 <strong>{macros.fat}g</strong> 食用油/橄榄油 (约100g/100g)</li>
          </ul>
          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px' }}>*注：肉类和烹饪过程自带大量隐形脂肪，通常不需要刻意大量吃脂肪。</div>
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--text-color)', opacity: 0.6, lineHeight: 1.5 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          计算结果基于 Mifflin-St Jeor 公式。建议将此数值作为基准，并根据未来 2 周的真实体重变化进行上下 100-200 千卡的微调。
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-color)',
  color: 'var(--text-color)',
  fontSize: '16px'
};

const goalBtnStyle = {
  flex: 1,
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};
