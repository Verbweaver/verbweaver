import { Outlet } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import NewProjectDialog from './NewProjectDialog'
import DonationPromptDialog from './DonationPromptDialog'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '@verbweaver/shared'
import { useProjectStore } from '../store/projectStore'
import { useTabStore, Tab } from '../store/tabStore'

// Check if we're in Electron
const isElectron = window.electronAPI !== undefined

function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const groupRef = useRef<any>(null)
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [showDonationPrompt, setShowDonationPrompt] = useState(false)
  const { setCurrentProjectPath, currentProject, currentProjectPath } = useProjectStore()
  // Tabs are saved per project: by folder on desktop (known at once and never changes; the id can
  // briefly be the folder path while the backend starts), by project id on web
  const projectKey = isElectron ? currentProjectPath : (currentProject?.id || null)
  const navigate = useNavigate()
  // One-time donation prompt on 5th app open (idempotent per session)
  useEffect(() => {
    try {
      // Prevent double-increment within a single app session (e.g., StrictMode/dev remounts)
      const sessionGuardKey = 'verbweaver_session_incremented'
      if (sessionStorage.getItem(sessionGuardKey) === 'true') return
      sessionStorage.setItem(sessionGuardKey, 'true')

      const alreadyShown = localStorage.getItem('verbweaver_donation_prompt_shown') === 'true'
      const raw = localStorage.getItem('verbweaver_open_count')
      const prev = raw ? parseInt(raw, 10) || 0 : 0
      const next = prev + 1
      localStorage.setItem('verbweaver_open_count', String(next))
      if (!alreadyShown && next === 5) {
        localStorage.setItem('verbweaver_donation_prompt_shown', 'true')
        setShowDonationPrompt(true)
      }
    } catch {}
  }, [])

  const handleDonate = () => {
    try {
      if (isElectron && (window as any).electronAPI?.openExternal) {
        ;(window as any).electronAPI.openExternal('https://verbweaver.design/donate')
      } else {
        window.open('https://verbweaver.design/donate', '_blank', 'noopener,noreferrer')
      }
    } catch {
      try { window.open('https://verbweaver.design/donate', '_blank', 'noopener,noreferrer') } catch {}
    }
    setShowDonationPrompt(false)
  }

  const handleCloseDonationPrompt = () => {
    try { localStorage.setItem('verbweaver_donation_prompt_shown', 'true') } catch {}
    setShowDonationPrompt(false)
  }


  useEffect(() => {
    // Per-project tab persistence: on project change, load tab set for that project from localStorage
    if (!projectKey) return
    const { setTabs } = useTabStore.getState()
    try {
      // Older desktop versions saved tabs under the project id
      const legacyId = isElectron && currentProject?.id && currentProject.id !== projectKey ? currentProject.id : null
      const raw = localStorage.getItem(`verbweaver_tabs_${projectKey}`)
        ?? (legacyId ? localStorage.getItem(`verbweaver_tabs_${legacyId}`) : null)
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && Array.isArray(parsed.tabs)) {
        setTabs(parsed.tabs as Tab[], parsed.activeTabId as string | null)
      } else {
        // No saved tabs for this project: ensure a dashboard
        setTabs([])
      }
    } catch {
      setTabs([])
    }
    // Show the restored active tab, so the page matches the highlighted tab
    const active = useTabStore.getState().getActiveTab()
    if (active) navigate(active.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey])

  // Save the open project's tabs whenever they change. A store subscription rather than a render
  // dependency, so the whole app shell doesn't re-render on every tab change (e.g. each keystroke
  // in the Editor, which keeps unsaved text on its tab). Set up after the restore above, so a
  // project's restored tabs are never saved under another project.
  useEffect(() => {
    if (!projectKey) return
    return useTabStore.subscribe((state, prev) => {
      if (state.tabs === prev.tabs && state.activeTabId === prev.activeTabId) return
      try {
        localStorage.setItem(`verbweaver_tabs_${projectKey}`, JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId }))
      } catch { /* storage full or unavailable */ }
    })
  }, [projectKey])

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return

    // Listen for menu events from Electron
    const unsubscribeNewProject = window.electronAPI.onMenuNewProject?.(() => {
      console.log('New Project menu clicked')
      setShowNewProjectDialog(true)
    })

    const unsubscribeOpenProject = window.electronAPI.onMenuOpenProject?.(() => {
      console.log('Open Project menu clicked')
      // TODO: Implement open project dialog
      handleOpenProject()
    })

    // Switch to the view's tab (as the sidebar does), so the tab bar matches the page
    const unsubscribeSettings = window.electronAPI.onMenuSettings?.(() => {
      navigate(useTabStore.getState().openViewTab('settings', '/settings', 'Settings'))
    })

    const unsubscribeHelpDocumentation = window.electronAPI.onMenuHelpDocumentation?.(() => {
      navigate(useTabStore.getState().openViewTab('help', '/help', 'Help'))
    })

    // Cleanup
    return () => {
      unsubscribeNewProject?.()
      unsubscribeOpenProject?.()
      unsubscribeSettings?.()
      unsubscribeHelpDocumentation?.()
    }
  }, [navigate])

  const handleOpenProject = async () => {
    if (!isElectron || !window.electronAPI) return
    
    try {
      const result = await window.electronAPI.openDirectory?.()
      if (result && !result.canceled && result.filePaths.length > 0) {
        const projectPath = result.filePaths[0]
        console.log('Selected project:', projectPath)
        
        // Open the project using the Electron API
        await window.electronAPI.openProject?.(projectPath)
        
        // Update the project store with the current project path. Layout then restores this
        // project's tabs and shows its active tab.
        await setCurrentProjectPath(projectPath)
      }
    } catch (error) {
      console.error('Error opening project:', error)
      alert('Failed to open project: ' + error)
    }
  }

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  // Apply panel layout after collapse state changes to avoid updating during render
  useEffect(() => {
    const sidebarSize = isSidebarCollapsed ? 6 : 18
    const mainSize = 100 - sidebarSize
    const apply = () => {
      try { groupRef.current?.setLayout?.([sidebarSize, mainSize]) } catch {}
    }
    // Defer to next tick to ensure PanelGroup is mounted
    const id = setTimeout(apply, 0)
    return () => clearTimeout(id)
  }, [isSidebarCollapsed])

  return (
    <div className="h-screen flex flex-col bg-background">
      <PanelGroup ref={groupRef} direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <Panel
          defaultSize={18}
          minSize={isSidebarCollapsed ? 3 : 10}
          maxSize={30}
          collapsible
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
        >
          <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

        {/* Main Content */}
        <Panel defaultSize={80}>
          <div className="h-full flex flex-col">
            <TabBar />
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </Panel>
      </PanelGroup>
      
      {/* Dialogs */}
      <NewProjectDialog 
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
      />
      <DonationPromptDialog
        isOpen={showDonationPrompt}
        onDonate={handleDonate}
        onClose={handleCloseDonationPrompt}
      />
    </div>
  )
}

export default Layout 