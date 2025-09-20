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
  const tabStore = useTabStore()
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
    const projectKey = currentProject?.id || currentProjectPath || null
    if (!projectKey) return
    try {
      const raw = localStorage.getItem(`verbweaver_tabs_${projectKey}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.tabs)) {
          tabStore.setTabs(parsed.tabs as Tab[], parsed.activeTabId as string | null)
          return
        }
      }
      // No saved tabs for this project: ensure a dashboard
      tabStore.setTabs([])
    } catch {}
  }, [currentProject?.id, currentProjectPath])

  useEffect(() => {
    // Persist tabs for current project whenever tabs or active tab change
    const projectKey = currentProject?.id || currentProjectPath || null
    if (!projectKey) return
    try {
      const state = { tabs: tabStore.tabs, activeTabId: tabStore.activeTabId }
      localStorage.setItem(`verbweaver_tabs_${projectKey}`, JSON.stringify(state))
    } catch {}
  }, [tabStore.tabs, tabStore.activeTabId, currentProject?.id, currentProjectPath])

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

    const unsubscribeSettings = window.electronAPI.onMenuSettings?.(() => {
      console.log('Settings menu clicked')
      navigate('/settings')
    })

    const unsubscribeHelpDocumentation = window.electronAPI.onMenuHelpDocumentation?.(() => {
      console.log('Help Documentation menu clicked')
      navigate('/help')
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
        
        // Update the project store with the current project path
        await setCurrentProjectPath(projectPath)
        
        // Navigate to dashboard after opening project
        navigate('/dashboard')
      }
    } catch (error) {
      console.error('Error opening project:', error)
      alert('Failed to open project: ' + error)
    }
  }

  const handleTabChange = (path: string) => {
    // Implement tab change logic
  }

  const handleNewTab = () => {
    // Default to graph view for new tabs
    // Implement new tab logic
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