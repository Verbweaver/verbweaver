import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Graph from './pages/Graph'
import Tasks from './views/TasksView'
import Version from './pages/Version'
import Compiler from './pages/Compiler'
import Settings from './pages/Settings'
import Help from './pages/Help'
import Login from './pages/Login'
import RequestPasswordReset from './pages/RequestPasswordReset'
import ResetPassword from './pages/ResetPassword'
import SecuritySettingsPage from './pages/UserSettings/SecuritySettingsPage'
import ProfileSettingsPage from './pages/UserSettings/ProfileSettingsPage'
import AppearanceSettingsPage from './pages/UserSettings/AppearanceSettingsPage'
import ProjectSettingsPage from './pages/UserSettings/ProjectSettingsPage'
import TemplatesSettingsPage from './pages/UserSettings/TemplatesSettingsPage'
import { useProjectStore } from './store/projectStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './services/auth'

function App() {
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const { loadProjects } = useProjectStore()
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isAuthHydrated = useAuthStore(state => state.isHydrated)
  const hasLoadedProjects = useRef(false)

  console.log('App component loaded, isAuthenticated:', isAuthenticated, 'isAuthHydrated:', isAuthHydrated)
  console.log('Is Electron?', window.electronAPI !== undefined)

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.remove('light', 'dark', 'high-contrast', 'colorblind')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    if (isAuthHydrated && isAuthenticated && !hasLoadedProjects.current) {
      console.log('Auth store hydrated and user authenticated, attempting to load projects.');
      hasLoadedProjects.current = true
      loadProjects()
    } else if (isAuthHydrated && !isAuthenticated) {
      console.log('Auth store hydrated but user not authenticated, skipping project load.');
      hasLoadedProjects.current = false // Reset flag when user logs out
    } else if (!isAuthHydrated) {
      console.log('Auth store not yet hydrated, waiting to load projects.');
    }
  }, [isAuthHydrated, isAuthenticated]) // Remove loadProjects from dependencies

  // Global keyboard shortcuts to switch views
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const active = document.activeElement as HTMLElement | null
      const isTextInput = !!(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))

      // Ctrl+Alt+C → Compiler (avoid Chromium's Ctrl+Shift+C conflict)
      if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'c') {
        e.preventDefault()
        navigate('/compiler')
        return
      }

      // Ctrl+Shift+<Key> view switches
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return
      switch (key) {
        case 'e':
          if (isTextInput) return
          navigate('/editor'); e.preventDefault(); break
        case 'g':
          if (isTextInput) return
          navigate('/graph'); e.preventDefault(); break
        case 'v':
          if (isTextInput) return
          navigate('/version'); e.preventDefault(); break
        case 't':
          if (isTextInput) return
          navigate('/tasks'); e.preventDefault(); break
        case 'h':
          if (isTextInput) return
          navigate('/help'); e.preventDefault(); break
        case 's':
          if (isTextInput) return
          navigate('/settings'); e.preventDefault(); break
        case 'c':
        case 'm':
        case 'x':
          // Fallbacks for Compiler if Ctrl+Shift is used (may be intercepted by Chromium)
          navigate('/compiler'); e.preventDefault(); break
        case 'd':
          if (isTextInput) return
          navigate('/dashboard'); e.preventDefault(); break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  if (!isAuthHydrated && !window.electronAPI) {
    console.log('App waiting for auth hydration...');
    return <div>Loading authentication...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request-password-reset" element={<RequestPasswordReset />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:taskPath" element={<Tasks />} />
        {/* Backward compatibility redirects */}
        <Route path="threads" element={<Navigate to="/tasks" replace />} />
        <Route path="threads/:taskPath" element={<Navigate to="/tasks/:taskPath" replace />} />
        <Route path="version" element={<Version />} />
        <Route path="compiler" element={<Compiler />} />
          <Route path="settings" element={<Settings />}>
          <Route index element={<ProfileSettingsPage />} />
          <Route path="appearance" element={<AppearanceSettingsPage />} />
          <Route path="security" element={<SecuritySettingsPage />} />
          <Route path="project" element={<ProjectSettingsPage />} />
            <Route path="templates" element={<TemplatesSettingsPage />} />
        </Route>
        <Route path="help" element={<Help />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  )
}

export default App 