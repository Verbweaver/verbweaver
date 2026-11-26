import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
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
import Support from './pages/Support'
import Login from './pages/Login'
import RequestPasswordReset from './pages/RequestPasswordReset'
import ResetPassword from './pages/ResetPassword'
import SecuritySettingsPage from './pages/UserSettings/SecuritySettingsPage'
import ProfileSettingsPage from './pages/UserSettings/ProfileSettingsPage'
import AppearanceSettingsPage from './pages/UserSettings/AppearanceSettingsPage'
import ProjectSettingsPage from './pages/UserSettings/ProjectSettingsPage'
import TemplatesSettingsPage from './pages/UserSettings/TemplatesSettingsPage'
import CollaborationSettingsPage from './pages/UserSettings/CollaborationSettingsPage'
import DependenciesSettingsPage from './pages/UserSettings/DependenciesSettingsPage'
import DependencyChecker from './components/DependencyChecker'
import { useProjectStore } from './store/projectStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './services/auth'
import { useTabStore, TabType } from './store/tabStore'

// Legacy /threads/:taskPath URLs. <Navigate to="/tasks/:taskPath"> would not substitute the param.
function ThreadsRedirect() {
  const { taskPath } = useParams()
  return <Navigate to={`/tasks/${encodeURIComponent(taskPath ?? '')}`} replace />
}

function App() {
  const navigate = useNavigate()
  const { theme, customVars } = useThemeStore()
  const { loadProjects } = useProjectStore()
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isAuthHydrated = useAuthStore(state => state.isHydrated)
  const hasLoadedProjects = useRef(false)

  console.log('App component loaded, isAuthenticated:', isAuthenticated, 'isAuthHydrated:', isAuthHydrated)
  console.log('Is Electron?', window.electronAPI !== undefined)

  useEffect(() => {
    const root = document.documentElement
    // Apply theme class
    root.classList.remove('light', 'dark', 'high-contrast', 'colorblind', 'custom')
    // Default colorblind and high-contrast to dark
    if (theme === 'colorblind' || theme === 'high-contrast') {
      root.classList.add('dark')
    }
    root.classList.add(theme)
    // Manage inline custom variables
    if (theme === 'custom' && customVars) {
      Object.entries(customVars).forEach(([k, v]) => {
        if (v && v.length > 0) root.style.setProperty(`--${k}`, v)
      })
    } else {
      // Remove any previously applied custom overrides so built-in themes are unaffected
      if (customVars) {
        Object.keys(customVars).forEach((k) => {
          root.style.removeProperty(`--${k}`)
        })
      }
    }
  }, [theme, customVars])

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
    // Switch to the view's tab (as the sidebar does), so the tab bar matches the page
    const openView = (type: TabType, href: string, title: string) => {
      navigate(useTabStore.getState().openViewTab(type, href, title))
    }
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const active = document.activeElement as HTMLElement | null
      const isTextInput = !!(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))

      // Ctrl+Alt+C → Compiler (avoid Chromium's Ctrl+Shift+C conflict)
      if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'c') {
        e.preventDefault()
        openView('compiler', '/compiler', 'Compiler')
        return
      }

      // Ctrl+Shift+<Key> view switches
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return
      switch (key) {
        case 'e':
          if (isTextInput) return
          openView('editor', '/editor', 'Editor'); e.preventDefault(); break
        case 'g':
          if (isTextInput) return
          openView('graph', '/graph', 'Graph'); e.preventDefault(); break
        case 'v':
          if (isTextInput) return
          openView('version', '/version', 'Version Control'); e.preventDefault(); break
        case 't':
          if (isTextInput) return
          openView('tasks', '/tasks', 'Tasks'); e.preventDefault(); break
        case 'h':
          if (isTextInput) return
          openView('help', '/help', 'Help'); e.preventDefault(); break
        case 's':
          if (isTextInput) return
          openView('settings', '/settings', 'Settings'); e.preventDefault(); break
        case 'c':
        case 'm':
        case 'x':
          // Fallbacks for Compiler if Ctrl+Shift is used (may be intercepted by Chromium)
          openView('compiler', '/compiler', 'Compiler'); e.preventDefault(); break
        case 'd':
          if (isTextInput) return
          openView('dashboard', '/dashboard', 'Dashboard'); e.preventDefault(); break
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
    <>
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
          <Route path="threads/:taskPath" element={<ThreadsRedirect />} />
          <Route path="version" element={<Version />} />
          <Route path="compiler" element={<Compiler />} />
            <Route path="settings" element={<Settings />}>
            <Route index element={<ProfileSettingsPage />} />
            <Route path="appearance" element={<AppearanceSettingsPage />} />
            {!window.electronAPI && <Route path="security" element={<SecuritySettingsPage />} />}
            <Route path="project" element={<ProjectSettingsPage />} />
            <Route path="collaboration" element={<CollaborationSettingsPage />} />
            <Route path="templates" element={<TemplatesSettingsPage />} />
            <Route path="dependencies" element={<DependenciesSettingsPage />} />
          </Route>
          <Route path="help" element={<Help />} />
          <Route path="support" element={<Support />} />
        </Route>
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
      
      {/* Global dependency checker - only shows when there are missing dependencies */}
      <DependencyChecker showOnStartup={true} />
    </>
  )
}

export default App 