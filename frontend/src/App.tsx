import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Graph from './pages/Graph'
import Threads from './views/ThreadsView'
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
import { useProjectStore } from './store/projectStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './services/auth'

function App() {
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
        <Route path="threads" element={<Threads />} />
        <Route path="threads/:taskPath" element={<Threads />} />
        <Route path="version" element={<Version />} />
        <Route path="compiler" element={<Compiler />} />
        <Route path="settings" element={<Settings />}>
          <Route index element={<ProfileSettingsPage />} />
          <Route path="appearance" element={<AppearanceSettingsPage />} />
          <Route path="security" element={<SecuritySettingsPage />} />
          <Route path="project" element={<ProjectSettingsPage />} />
        </Route>
        <Route path="help" element={<Help />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
    </Routes>
  )
}

export default App 