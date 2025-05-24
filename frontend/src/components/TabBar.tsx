import { X, Plus } from 'lucide-react'
import clsx from 'clsx'
import { TAB_HEIGHT } from '@verbweaver/shared'

interface Tab {
  id: string
  path: string
  title: string
}

interface TabBarProps {
  currentPath: string
  onTabChange: (path: string) => void
  onNewTab: () => void
}

// TODO: This should be managed in a store for persistence
const mockTabs: Tab[] = [
  { id: '1', path: '/graph', title: 'Graph' },
  { id: '2', path: '/editor', title: 'Editor' },
]

function TabBar({ currentPath, onTabChange, onNewTab }: TabBarProps) {
  const tabs = mockTabs // Will be replaced with store

  return (
    <div 
      className="flex items-center bg-muted/30 border-b border-border overflow-x-auto scrollbar-thin"
      style={{ height: `${TAB_HEIGHT}px` }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.path)}
          className={clsx(
            'flex items-center gap-2 px-4 h-full border-r border-border transition-colors min-w-[120px]',
            'hover:bg-accent/50',
            currentPath.startsWith(tab.path) && 'bg-background'
          )}
        >
          <span className="text-sm truncate">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              // TODO: Implement close tab
            }}
            className="p-0.5 rounded hover:bg-muted"
          >
            <X className="w-3 h-3" />
          </button>
        </button>
      ))}
      
      <button
        onClick={onNewTab}
        className="p-2 hover:bg-accent/50 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

export default TabBar 