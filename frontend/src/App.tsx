import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Graph from './pages/Graph'
import Threads from './pages/Threads'
import Version from './pages/Version'
import Compiler from './pages/Compiler'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { useProjectStore } from './store/projectStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './services/auth'

function App() {
  const { theme } = useThemeStore()
  const { loadProjects } = useProjectStore()
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.remove('light', 'dark', 'high-contrast', 'colorblind')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    // Load projects on app start
    loadProjects()
  }, [loadProjects])

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="editor" element={<Editor />} />
          <Route path="graph" element={<Graph />} />
          <Route path="threads" element={<Threads />} />
          <Route path="version" element={<Version />} />
          <Route path="compiler" element={<Compiler />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Router>
  )
}

export default App 