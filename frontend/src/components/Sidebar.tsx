import { useNavigate } from 'react-router-dom'
import { 
  FileText, 
  GitBranch, 
  Package,
  HelpCircle,
  Settings,
  User,
  LayoutDashboard,
  MessageSquare,
  Share2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import { useProjectStore } from '../store/projectStore'
import { useAuthStore } from '../services/auth'
import { useTabStore } from '../store/tabStore'
import { useEffect, useState } from 'react'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

interface SidebarProps {
  isCollapsed: boolean
  onToggleCollapse?: () => void
}

function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { user } = useAuthStore()
  const { tabs, addTab, setActiveTab } = useTabStore()
  const [faviconPath, setFaviconPath] = useState('/favicon.svg')

  // Get the favicon path dynamically
  useEffect(() => {
    if (isElectron) {
      // In Electron, try to get the favicon from the document head
      const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement
      if (faviconLink && faviconLink.href) {
        // Extract the relative path
        const url = new URL(faviconLink.href, window.location.href)
        setFaviconPath(url.pathname)
      } else {
        // Fallback to the known hashed path
        setFaviconPath('./assets/favicon-CBf4nkjE.svg')
      }
    }
  }, [isElectron])

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, type: 'dashboard' as const },
    { name: 'Editor', href: '/editor', icon: FileText, type: 'editor' as const },
    { name: 'Graph', href: '/graph', icon: Share2, type: 'graph' as const },
    { name: 'Tasks', href: '/tasks', icon: MessageSquare, type: 'tasks' as const },
    { name: 'Version Control', href: '/version', icon: GitBranch, type: 'version' as const },
    { name: 'Compiler', href: '/compiler', icon: Package, type: 'compiler' as const },
  ]

  const handleNavClick = (e: React.MouseEvent, item: typeof navigation[0]) => {
    e.preventDefault()
    
    // Check if tab already exists
    const existingTab = tabs.find(tab => tab.type === item.type && !tab.metadata?.filePath)
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
    } else {
      // Create new tab
      addTab({
        path: item.href,
        title: item.name,
        type: item.type
      })
    }
    
    navigate(item.href)
  }

  const handleBottomNavClick = (e: React.MouseEvent, href: string, name: string, type: 'help' | 'settings') => {
    e.preventDefault()
    
    // Check if tab already exists
    const existingTab = tabs.find(tab => tab.type === type)
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
    } else {
      // Create new tab
      addTab({
        path: href,
        title: name,
        type: type
      })
    }
    
    navigate(href)
  }

  return (
    <div className={clsx("h-full bg-muted/50 border-r border-border flex flex-col")}> 
      {/* Logo/Title */}
      <div className="p-4 border-b border-border flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {!isCollapsed && (
            <>
              <div className="flex items-center gap-2">
                <img src={faviconPath} alt="Verbweaver" className="w-6 h-6" />
                <h1 className="text-xl font-bold leading-tight">Verbweaver</h1>
              </div>
              {currentProject && (
                <p className="text-sm text-muted-foreground mt-1 truncate" title={currentProject.name}>{currentProject.name}</p>
              )}
            </>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 flex items-center justify-center">
              <img src={faviconPath} alt="Verbweaver" className="w-6 h-6" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-accent"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-2 space-y-1">
        {navigation.map((item) => (
          <a
            key={item.name}
            href={item.href}
            onClick={(e) => handleNavClick(e, item)}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer',
              'hover:bg-accent hover:text-accent-foreground',
              isCollapsed && 'justify-center'
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>{item.name}</span>}
          </a>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-border space-y-1">
        <a
          href="/help"
          onClick={(e) => handleBottomNavClick(e, '/help', 'Help', 'help')}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full cursor-pointer',
            'hover:bg-accent hover:text-accent-foreground',
            isCollapsed && 'justify-center'
          )}
        >
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Help</span>}
        </a>
        
        <a
          href="/settings"
          onClick={(e) => handleBottomNavClick(e, '/settings', 'Settings', 'settings')}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full cursor-pointer',
            'hover:bg-accent hover:text-accent-foreground',
            isCollapsed && 'justify-center'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </a>

        {/* User info section */}
        {user && !isCollapsed && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm truncate">{user.name || user.email}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Sidebar 