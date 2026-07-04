import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Home from './pages/Home'
import AuthCallback from './pages/AuthCallback'
import SetupUsername from './pages/SetupUsername'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/setup-username" element={<SetupUsername />} />
    </Routes>
  )
}
