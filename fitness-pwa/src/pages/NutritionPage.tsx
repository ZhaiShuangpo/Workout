import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Utensils, Info, Plus, Trash2, Check } from 'lucide-react';
import { db, type UserProfile } from '../db';
import { allocateWholePortions, isValidProfile, nutritionTargets } from '../domain/fitness';

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
  const [selectedTab, setSelectedTab] = useState<'home' | 'takeout' | 'minimal'>('home');
  const today = new Date().toLocaleDateString('en-CA');
  const entries = useLiveQuery(() => db.nutritionEntries.where('date').equals(today).toArray(), [today]) || [];
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const supplements = useLiveQuery(() => db.supplements.toArray()) || [];
  const supplementChecks = useLiveQuery(() => db.supplementChecks.where('date').equals(today).toArray(), [today]) || [];
  const [entryName, setEntryName] = useState('');
  const [entryCalories, setEntryCalories] = useState(0);
  const [entryProtein, setEntryProtein] = useState(0);
  const [entryCarbs, setEntryCarbs] = useState(0);
  const [entryFat, setEntryFat] = useState(0);
  const [saveAsRecipe, setSaveAsRecipe] = useState(false);

  const profile: UserProfile = useMemo(() => ({ id: 'current', gender, age, height, weight, activity, goal }), [gender, age, height, weight, activity, goal]);
  const profileValid = isValidProfile(profile);
  const targets = nutritionTargets(profile);
  const { tdee, calories: targetCalories, protein, fat, carbs } = targets;
  const macros = { protein, fat, carbs };
  const consumed = entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories,
    protein: sum.protein + entry.protein,
    carbs: sum.carbs + entry.carbs,
    fat: sum.fat + entry.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Save to localStorage when inputs change
  useEffect(() => {
    if (!profileValid) return;
    localStorage.setItem('nutrition_profile', JSON.stringify(profile));
    db.userProfiles.put(profile).catch(console.error);
  }, [profile, profileValid]);

  const addEntry = async (values = { name: entryName, calories: entryCalories, protein: entryProtein, carbs: entryCarbs, fat: entryFat }) => {
    if (!values.name.trim() || values.calories < 0 || values.protein < 0 || values.carbs < 0 || values.fat < 0) {
      alert('请输入餐食名称，营养数值不能为负数');
      return;
    }
    await db.nutritionEntries.add({ date: today, ...values, name: values.name.trim() });
    if (saveAsRecipe && !recipes.some(recipe => recipe.name === values.name.trim())) {
      await db.recipes.add({ ...values, name: values.name.trim() });
    }
    setEntryName('');
    setEntryCalories(0);
    setEntryProtein(0);
    setEntryCarbs(0);
    setEntryFat(0);
    setSaveAsRecipe(false);
  };

  const toggleSupplement = async (supplementId: number) => {
    const existing = supplementChecks.find(check => check.supplementId === supplementId);
    if (existing) await db.supplementChecks.delete(existing.id!);
    else await db.supplementChecks.add({ supplementId, date: today });
  };

  const renderMealsPlan = () => {
    // 换算手掌/拳头/碗等单位
    const proteinPortions = Math.max(3, Math.round(protein / 20));
    const carbPortions = Math.max(3, Math.round(carbs / 30));
    const fatPortions = Math.max(2, Math.round(fat / 10));

    // 动态分餐比例：早餐 25%, 午餐 40%, 晚餐 35%
    const [pB, pL, pD] = allocateWholePortions(proteinPortions);
    const [cB, cL, cD] = allocateWholePortions(carbPortions);
    const [fB, fL, fD] = allocateWholePortions(fatPortions, [0.2, 0.4, 0.4]);

    const mealStyle = {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      borderBottom: '1px solid var(--border-color)',
      paddingBottom: '16px'
    };

    const mealHeaderStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontWeight: 'bold',
      fontSize: '15px'
    };

    const badgeStyle = (bgColor: string) => ({
      padding: '2px 8px',
      borderRadius: '4px',
      color: '#fff',
      fontSize: '11px',
      backgroundColor: bgColor
    });

    interface MealPlanItem {
      title: string;
      badgeColor: string;
      staple: string;
      protein: string;
      vegetable?: string;
      fat?: string;
    }

    const targetList: MealPlanItem[] = {
      home: [
        {
          title: '早餐 (元气开启)',
          badgeColor: '#10b981',
          staple: `拳头大小的蒸红薯/蒸紫薯 ${cB} 个 (或全麦面包 ${cB} 片/生燕麦 ${Math.round(cB * 40)}g)`,
          protein: `水煮蛋/煎蛋 ${pB} 个 (或配无糖豆浆/牛奶 ${Math.round(pB * 200)}ml)`,
          vegetable: `生菜、小黄瓜 1 捧 (补充膳食纤维，清爽去腻)`,
          fat: `烹饪用油控制在 ${fB} 拇指量以内`
        },
        {
          title: '中餐 (能量续航)',
          badgeColor: '#3b82f6',
          staple: `普通饭碗熟米饭 ${cL} 碗 (优先推荐杂粮饭/糙米饭)`,
          protein: `手掌心大小的炒肉类/鱼肉 ${pL} 个 (如尖椒炒肉/番茄炒蛋/黑椒牛肉)`,
          vegetable: `清炒时蔬、西兰花等 ${Math.max(2, cL)} 捧 (少油清炒，水焯更佳)`,
          fat: `烹饪用油控制在 ${fL} 拇指量以内`
        },
        {
          title: '晚餐 (轻负担修复)',
          badgeColor: '#8b5cf6',
          staple: `熟米饭 ${cD} 碗 (或蒸土豆/紫薯 ${cD} 个/水煮玉米 ${cD} 根)`,
          protein: `手掌心大小的清蒸鱼/虾肉/去皮鸡肉 ${pD} 个 (或豆腐/滑蛋等)`,
          vegetable: `少油蔬菜、菌菇类 2 捧`,
          fat: `烹饪用油控制在 ${fD} 拇指量以内 (尽量少油)`
        }
      ],
      takeout: [
        {
          title: '早餐 (便利店优选)',
          badgeColor: '#10b981',
          staple: `中等包子/烧麦 ${cB} 个 (或全麦三明治 1 份)`,
          protein: `茶叶蛋 ${pB} 个 + 无糖豆浆/脱脂牛奶 1 杯`,
          vegetable: `小番茄/圣女果 1 盒`
        },
        {
          title: '中餐 (快餐自选/盖饭)',
          badgeColor: '#3b82f6',
          staple: `盖饭/自选餐主食米饭 ${cL} 碗 (叮嘱商家少浇汤汁)`,
          protein: `手掌大的肉类主菜 ${pL} 份 (如小炒鸡/牛肉，吃前可用清水涮去表面油分)`,
          vegetable: `白灼生菜/菜心 1-2 份`
        },
        {
          title: '晚餐 (轻食/面点)',
          badgeColor: '#8b5cf6',
          staple: `牛肉面/汤粉中的主食 ${cD} 碗 (少喝汤，避免盐分超标)`,
          protein: `酱牛肉/去皮鸡腿/煎豆腐 ${pD} 份 (或点一份沙拉选择鸡胸/虾仁配低卡醋汁)`,
          vegetable: `沙拉菜/面里配菜 2 捧`
        }
      ],
      minimal: [
        {
          title: '早餐 (快手燕麦)',
          badgeColor: '#10b981',
          staple: `燕麦片 ${Math.round(cB * 40)}g (温水/牛奶冲泡)`,
          protein: `水煮蛋/荷包蛋 ${pB} 个`
        },
        {
          title: '中餐 (快手简餐)',
          badgeColor: '#3b82f6',
          staple: `水煮红薯/紫薯 ${cL} 个 (或即食玉米 ${cL} 根)`,
          protein: `即食无油鸡胸肉/水浸吞拿鱼罐头 ${pL} 块 (约 ${Math.round(pL * 100)}g)`,
          vegetable: `水焯西兰花/生菜 ${Math.max(2, cL)} 捧 (无需调料或仅加极少低钠酱油)`
        },
        {
          title: '晚餐 (蒸煮减负)',
          badgeColor: '#8b5cf6',
          staple: `水煮土豆/南瓜 ${cD} 个`,
          protein: `无油香煎豆腐/水煮虾仁/去皮鸡腿肉 ${pD} 个`,
          vegetable: `凉拌黄瓜/生吃大西红柿 2 捧`
        }
      ]
    }[selectedTab];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {targetList.map((meal, index) => (
          <div key={index} style={index === targetList.length - 1 ? { ...mealStyle, borderBottom: 'none', paddingBottom: 0 } : mealStyle}>
            <div style={mealHeaderStyle}>
              <span style={badgeStyle(meal.badgeColor)}>{meal.title.split(' ')[0]}</span>
              <span style={{ fontSize: '14px', opacity: 0.9 }}>{meal.title.split(' ')[1]}</span>
            </div>
            <div style={{ fontSize: '13px', opacity: 0.85, display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', borderLeft: `2px solid ${meal.badgeColor}` }}>
              <div>🍚 <b>主食(碳水)：</b>{meal.staple}</div>
              <div>🥩 <b>主菜(蛋白)：</b>{meal.protein}</div>
              {meal.vegetable && <div>🥦 <b>配菜(蔬菜)：</b>{meal.vegetable}</div>}
              {meal.fat && <div>🥑 <b>油脂控制：</b>{meal.fat}</div>}
            </div>
          </div>
        ))}
        
        {/* 温馨提示 */}
        <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
          💡 <b>提示：</b>以上方案已根据您当前的<b>“{goal === 'cut' ? '减脂' : goal === 'bulk' ? '增肌' : '保持'}”</b>目标及体重比例进行自适应份数调整。家常菜烹饪时通常自带隐性油脂，油脂控制份数供参考，不必刻意物外多加。
        </div>
      </div>

    );
  };

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

      {!profileValid && (
        <p role="alert" style={{ color: 'var(--danger-color)', fontSize: '13px', marginTop: '-14px' }}>
          请检查身体数据：年龄 13-100 岁、身高 100-230 cm、体重 25-350 kg。
        </p>
      )}

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

      {/* 每日摄入闭环 */}
      <section style={{ marginTop: '28px', backgroundColor: 'var(--surface-color)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '18px' }}>今日摄入与剩余</h3>
        <p style={{ margin: '0 0 14px', fontSize: '12px', opacity: 0.65 }}>{today}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {[
            ['热量', consumed.calories, targetCalories, 'kcal'],
            ['蛋白', consumed.protein, protein, 'g'],
            ['碳水', consumed.carbs, carbs, 'g'],
            ['脂肪', consumed.fat, fat, 'g']
          ].map(([label, actual, target, unit]) => (
            <div key={String(label)} style={{ background: 'var(--bg-color)', borderRadius: '8px', padding: '9px 5px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', opacity: 0.65 }}>{label}</div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{Number(actual).toFixed(0)}/{Number(target).toFixed(0)}</div>
              <div style={{ fontSize: '10px', color: Number(actual) > Number(target) ? 'var(--danger-color)' : 'var(--success-color)' }}>
                剩余 {Math.round(Number(target) - Number(actual))}{unit}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: '6px' }}>
          <input aria-label="餐食名称" placeholder="餐食名称" value={entryName} onChange={event => setEntryName(event.target.value)} style={compactInputStyle} />
          <NutritionNumber label="热量" value={entryCalories} onChange={setEntryCalories} />
          <NutritionNumber label="蛋白" value={entryProtein} onChange={setEntryProtein} />
          <NutritionNumber label="碳水" value={entryCarbs} onChange={setEntryCarbs} />
          <NutritionNumber label="脂肪" value={entryFat} onChange={setEntryFat} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', margin: '10px 0' }}>
          <input type="checkbox" checked={saveAsRecipe} onChange={event => setSaveAsRecipe(event.target.checked)} /> 保存为常用餐
        </label>
        <button onClick={() => addEntry()} style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '8px', background: 'var(--primary-color)', color: '#fff', fontWeight: 'bold' }}>
          <Plus size={15} style={{ verticalAlign: 'middle' }} /> 添加摄入
        </button>

        {recipes.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '6px' }}>常用餐一键添加</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {recipes.map(recipe => (
                <button key={recipe.id} onClick={() => addEntry(recipe)} style={{ border: '1px solid var(--border-color)', borderRadius: '16px', padding: '6px 10px', background: 'var(--bg-color)', color: 'var(--text-color)' }}>
                  {recipe.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {entries.map(entry => (
              <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'var(--bg-color)', padding: '8px', borderRadius: '7px' }}>
                <span>{entry.name}</span><span>{entry.calories} kcal · P{entry.protein} C{entry.carbs} F{entry.fat}</span>
                <button aria-label={`删除${entry.name}`} onClick={() => db.nutritionEntries.delete(entry.id!)} style={{ border: 'none', background: 'none', color: 'var(--danger-color)' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>今日补剂</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {supplements.map(supplement => {
              const checked = supplementChecks.some(item => item.supplementId === supplement.id);
              return <button key={supplement.id} onClick={() => toggleSupplement(supplement.id!)} style={{ display: 'flex', alignItems: 'center', gap: '5px', border: `1px solid ${checked ? 'var(--success-color)' : 'var(--border-color)'}`, borderRadius: '18px', padding: '7px 10px', background: checked ? 'var(--success-color)' : 'var(--bg-color)', color: checked ? '#fff' : 'var(--text-color)' }}>
                {checked && <Check size={14} />} {supplement.name}
              </button>;
            })}
          </div>
        </div>
      </section>

      {/* 饮食方案推荐 */}
      <div style={{ marginTop: '28px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Utensils size={18} color="var(--primary-color)" /> 实用的手掌/拳头量化膳食方案
        </h3>
        <p style={{ fontSize: '13px', opacity: 0.7, marginBottom: '16px', lineHeight: 1.5 }}>
          无需精准厨房秤！我们将您的每日营养目标折算为可视化的<b>“手掌/拳头/碗”</b>量纲，并为您提供三套极具操作性的饮食方案。
        </p>

        {/* 量纲图例指南 */}
        <div style={{
          backgroundColor: 'var(--surface-color)',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px dashed var(--border-color)',
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          fontSize: '12px',
          opacity: 0.85
        }}>
          <div>✊ <b>1个拳头主食</b> ≈ 1碗熟米饭 / 1个中等红薯 / 1个玉米 (约30g碳水)</div>
          <div>✋ <b>1个手掌蛋白</b> ≈ 1块手掌大小肉类 / 3个鸡蛋 / 200g豆腐 (约20g蛋白)</div>
          <div>👍 <b>1个拇指油脂</b> ≈ 1汤匙植物油 / 10粒坚果 (约10g脂肪)</div>
          <div>👐 <b>1大捧蔬菜</b> ≈ 1大把绿叶蔬菜 / 1根黄瓜 / 1个大西红柿 (膳食纤维，低热量)</div>
        </div>

        {/* 方案 Tab 切换 */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', backgroundColor: 'var(--surface-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setSelectedTab('home')}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
              backgroundColor: selectedTab === 'home' ? 'var(--primary-color)' : 'transparent',
              color: selectedTab === 'home' ? '#fff' : 'var(--text-color)',
              fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            🏠 家常小炒
          </button>
          <button
            onClick={() => setSelectedTab('takeout')}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
              backgroundColor: selectedTab === 'takeout' ? 'var(--primary-color)' : 'transparent',
              color: selectedTab === 'takeout' ? '#fff' : 'var(--text-color)',
              fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            🛵 外卖指南
          </button>
          <button
            onClick={() => setSelectedTab('minimal')}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
              backgroundColor: selectedTab === 'minimal' ? 'var(--primary-color)' : 'transparent',
              color: selectedTab === 'minimal' ? '#fff' : 'var(--text-color)',
              fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            🥑 极简自制
          </button>
        </div>

        {/* 方案内容展示 */}
        <div style={{
          backgroundColor: 'var(--surface-color)',
          padding: '20px',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {renderMealsPlan()}
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

const compactInputStyle = {
  minWidth: 0,
  width: '100%',
  padding: '8px 6px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-color)',
  color: 'var(--text-color)'
};

function NutritionNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <input aria-label={label} title={label} type="number" min={0} placeholder={label} value={value || ''} onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))} style={compactInputStyle} />;
}
