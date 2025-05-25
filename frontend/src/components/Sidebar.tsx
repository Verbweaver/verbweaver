import { NavLink } from 'react-router-dom'
import { 
  FileText, 
  GitBranch, 
  Package,
  HelpCircle,
  Settings,
  User,
  LayoutDashboard,
  MessageSquare,
  Share2
} from 'lucide-react'
import clsx from 'clsx'
import { useProjectStore } from '../store/projectStore'
import { useAuthStore } from '../services/auth'

interface SidebarProps {
  isCollapsed: boolean
}

function Sidebar({ isCollapsed }: SidebarProps) {
  const { currentProject } = useProjectStore()
  const { user } = useAuthStore()

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Editor', href: '/editor', icon: FileText },
    { name: 'Graph', href: '/graph', icon: Share2 },
    { name: 'Threads', href: '/threads', icon: MessageSquare },
    { name: 'Version Control', href: '/version', icon: GitBranch },
    { name: 'Compiler', href: '/compiler', icon: Package },
  ]

  return (
    <div className="h-full bg-muted/50 border-r border-border flex flex-col">
      {/* Logo/Title */}
      <div className="p-4 border-b border-border">
        {!isCollapsed && (
          <h1 className="text-xl font-bold">Verbweaver</h1>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold">V</span>
          </div>
        )}
        {currentProject && (
          <p className="text-sm text-muted-foreground mt-1">{currentProject.name}</p>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-2 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-primary text-primary-foreground',
                isCollapsed && 'justify-center'
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-border space-y-1">
        <NavLink
          to="/help"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full',
              'hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-primary text-primary-foreground',
              isCollapsed && 'justify-center'
            )
          }
        >
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Help</span>}
        </NavLink>
        
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full',
              'hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-primary text-primary-foreground',
              isCollapsed && 'justify-center'
            )
          }
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>

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