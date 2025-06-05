import { Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import NewProjectDialog from './NewProjectDialog'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '@verbweaver/shared'
import { useProjectStore } from '../store/projectStore'

// Check if we're in Electron
const isElectron = window.electronAPI !== undefined

function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const { setCurrentProjectPath } = useProjectStore()
  const navigate = useNavigate()

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

    // Cleanup
    return () => {
      unsubscribeNewProject?.()
      unsubscribeOpenProject?.()
      unsubscribeSettings?.()
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

  return (
    <div className="h-screen flex flex-col bg-background">
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <Panel
          defaultSize={20}
          minSize={isSidebarCollapsed ? 3 : 10}
          maxSize={30}
          collapsible
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
        >
          <Sidebar isCollapsed={isSidebarCollapsed} />
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
    </div>
  )
}

export default Layout 