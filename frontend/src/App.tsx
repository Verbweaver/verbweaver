import { Routes, Route, Navigate } from 'react-router-dom'
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
import Help from './pages/Help'
import Login from './pages/Login'
import { useProjectStore } from './store/projectStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './services/auth'

function App() {
  const { theme } = useThemeStore()
  const { loadProjects } = useProjectStore()
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isAuthHydrated = useAuthStore(state => state.isHydrated)

  console.log('App component loaded, isAuthenticated:', isAuthenticated, 'isAuthHydrated:', isAuthHydrated)
  console.log('Is Electron?', window.electronAPI !== undefined)

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.remove('light', 'dark', 'high-contrast', 'colorblind')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    if (isAuthHydrated) {
      console.log('Auth store hydrated, attempting to load projects.');
      loadProjects()
    } else {
      console.log('Auth store not yet hydrated, waiting to load projects.');
    }
  }, [loadProjects, isAuthHydrated])

  if (!isAuthHydrated && !window.electronAPI) {
    console.log('App waiting for auth hydration...');
    return <div>Loading authentication...</div>;
  }

  return (
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
        <Route path="editor/:filePath" element={<Editor />} />
        <Route path="graph" element={<Graph />} />
        <Route path="threads" element={<Threads />} />
        <Route path="version" element={<Version />} />
        <Route path="compiler" element={<Compiler />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  )
}

export default App 