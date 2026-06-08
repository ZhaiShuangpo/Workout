import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { Dumbbell, ClipboardList, Utensils, User } from 'lucide-react';
import { WorkoutPage } from './pages/WorkoutPage';
import { PlansPage } from './pages/PlansPage';
import { NutritionPage } from './pages/NutritionPage';
import { ProfilePage } from './pages/ProfilePage';

function App() {
  return (
    <Router>
      <div style={{ flex: 1, paddingBottom: '70px', overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<WorkoutPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </div>

      {/* 底部导航栏 */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '600px',
        height: '65px',
        backgroundColor: 'var(--surface-color)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom)' // 适配 iPhone 底部小黑条
      }}>
        <NavLink to="/" style={({isActive}) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '12px',
          color: isActive ? 'var(--primary-color)' : 'var(--text-color)',
          opacity: isActive ? 1 : 0.6
        })}>
          <Dumbbell size={24} style={{ marginBottom: '4px' }} />
          <span>训练</span>
        </NavLink>
        <NavLink to="/plans" style={({isActive}) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '12px',
          color: isActive ? 'var(--primary-color)' : 'var(--text-color)',
          opacity: isActive ? 1 : 0.6
        })}>
          <ClipboardList size={24} style={{ marginBottom: '4px' }} />
          <span>计划</span>
        </NavLink>
        <NavLink to="/nutrition" style={({isActive}) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '12px',
          color: isActive ? 'var(--primary-color)' : 'var(--text-color)',
          opacity: isActive ? 1 : 0.6
        })}>
          <Utensils size={24} style={{ marginBottom: '4px' }} />
          <span>饮食</span>
        </NavLink>
        <NavLink to="/profile" style={({isActive}) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '12px',
          color: isActive ? 'var(--primary-color)' : 'var(--text-color)',
          opacity: isActive ? 1 : 0.6
        })}>
          <User size={24} style={{ marginBottom: '4px' }} />
          <span>我的</span>
        </NavLink>
      </nav>
    </Router>
  )
}

export default App
