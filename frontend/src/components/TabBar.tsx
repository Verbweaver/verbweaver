import { X, Plus, Circle } from 'lucide-react'
import clsx from 'clsx'
import { TAB_HEIGHT } from '@verbweaver/shared'
import { useTabStore, Tab, isEmptyEditorTab, tabPathname, FOCUS_EDITOR_EVENT } from '../store/tabStore'
import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'

/** Does this tab show the given URL path? */
function tabOwnsPath(tab: Tab, pathname: string): boolean {
  if (tab.type === 'editor') {
    if (isEmptyEditorTab(tab)) return pathname === '/editor' || pathname === '/editor/'
    if (!pathname.startsWith('/editor/')) return false
    let filePath = pathname.slice('/editor/'.length)
    try { filePath = decodeURIComponent(filePath) } catch { /* not encoded: use as is */ }
    return filePath === tab.metadata?.filePath
  }
  const base = tabPathname(tab.path)
  return pathname === base || pathname.startsWith(base + '/')
}

function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const tabs = useTabStore(s => s.tabs)
  const activeTabId = useTabStore(s => s.activeTabId)
  const { removeTab, setActiveTab, updateTab } = useTabStore.getState()
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the active tab in step with the URL. The active tab wins when it shows this URL, so a
  // second tab of the same view (e.g. two Graph tabs) stays active; otherwise the first tab that
  // shows it becomes active. Non-editor tabs then remember the full URL (sub-page and query, e.g.
  // /settings/appearance or /help?doc=editor.md), so clicking the tab later returns to it.
  const { pathname, search } = location
  useEffect(() => {
    const active = tabs.find(tab => tab.id === activeTabId)
    let owner = active && tabOwnsPath(active, pathname) ? active : undefined
    if (!owner) {
      owner = tabs.find(tab => tabOwnsPath(tab, pathname))
      if (owner) setActiveTab(owner.id)
    }
    if (owner && owner.type !== 'editor') {
      const url = pathname + search
      if (owner.path !== url) updateTab(owner.id, { path: url })
    }
  }, [pathname, search, tabs, activeTabId, setActiveTab, updateTab])

  const handleTabClick = (tab: Tab) => {
    // Clicking the Editor tab you're already on puts you back in the editor (#169); switching
    // tabs is handled by the Editor when it restores the cursor
    if (tab.type === 'editor' && tab.id === activeTabId) window.dispatchEvent(new Event(FOCUS_EDITOR_EVENT))
    setActiveTab(tab.id)
    navigate(tab.path)
  }

  const handleCloseTab = (e: React.SyntheticEvent, tabId: string) => {
    e.stopPropagation()

    // Don't allow closing the last tab
    if (tabs.length === 1) return

    const tab = tabs.find(t => t.id === tabId)

    // If tab has unsaved changes, confirm before closing
    if (tab?.metadata?.isModified) {
      if (!confirm(`"${tab.title}" has unsaved changes. Close anyway?`)) {
        return
      }
    }

    const wasActive = tabId === activeTabId
    removeTab(tabId)

    // If we closed the active tab, show the tab the store activated in its place
    if (wasActive) {
      const next = useTabStore.getState().getActiveTab()
      if (next) navigate(next.path)
    }
  }

  const handleNewTab = () => {
    // New tabs open on the Graph view
    useTabStore.getState().addTab({ path: '/graph', title: 'Graph', type: 'graph' })
    navigate('/graph')
  }

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, tab: Tab, index: number) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleTabClick(tab)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
      const el = containerRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]
      el?.focus()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      handleCloseTab(e, tab.id)
    }
  }

  // Enable horizontal scrolling with the mouse wheel (vertical delta -> horizontal scroll)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return
      if (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaX) === 0) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Open tabs"
      className="flex items-center bg-muted/30 border-b border-border overflow-x-auto overflow-y-hidden scrollbar-thin"
      style={{ height: `${TAB_HEIGHT}px` }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={tab.title}
            className={clsx(
              'flex items-center gap-2 px-4 h-full border-r border-border transition-colors min-w-[120px] cursor-pointer',
              'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              isActive && 'bg-background'
            )}
            onClick={() => handleTabClick(tab)}
            onKeyDown={(e) => handleTabKeyDown(e, tab, index)}
            onAuxClick={(e) => {
              if (e.button === 1) handleCloseTab(e, tab.id)
            }}
          >
            <span className="text-sm truncate flex items-center gap-1">
              {tab.title}
              {tab.metadata?.isModified && (
                <Circle className="w-2 h-2 fill-current" aria-label="Unsaved changes" />
              )}
            </span>
            {tabs.length > 1 && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Close ${tab.title}`}
                title="Close tab"
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="p-0.5 rounded hover:bg-muted cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={handleNewTab}
        className="p-2 hover:bg-accent/50 transition-colors"
        title="New tab"
        aria-label="New tab"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

export default TabBar
