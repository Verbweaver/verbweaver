import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '@verbweaver/shared'

function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

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
            <TabBar 
              currentPath="/"
              onTabChange={handleTabChange}
              onNewTab={handleNewTab}
            />
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default Layout 