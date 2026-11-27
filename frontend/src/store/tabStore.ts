import { create } from 'zustand'
import { useProjectStore } from './projectStore'

export interface CompilerState {
  title?: string
  author?: string
  selectedNodes?: string[]
  orderedNodes?: string[]
  selectedFormat?: string
  selectedTemplate?: string
  customVariables?: Array<{ name: string; value: string }>
  nodeVariables?: Record<string, Record<string, any>>
  docVars?: Record<string, any>
  expandedDirs?: string[]
  options?: {
    includeMetadata?: boolean
    includeToc?: boolean
    includeIndex?: boolean
    includeBibliography?: boolean
    embedUploadedFiles?: boolean
    layoutPageSize?: 'default' | 'a4' | 'letter' | 'a5'
    layoutFontSize?: 'default' | 'small' | 'medium' | 'large'
    layoutMargins?: 'default' | 'narrow' | 'normal' | 'wide'
    layoutLineSpacing?: 'default' | 'single' | '1.5' | 'double'
    layoutFont?: string
    metadataFont?: string
  }
}

export type TabType = 'graph' | 'editor' | 'tasks' | 'version' | 'compiler' | 'dashboard' | 'settings' | 'help' | 'support'

export interface Tab {
  id: string
  /** The URL the tab shows. Non-editor tabs keep this in step with where you are inside them. */
  path: string
  title: string
  type: TabType
  metadata?: {
    filePath?: string // For editor tabs; an editor tab without one is an empty Editor tab
    isModified?: boolean // Track if file has unsaved changes
    unsavedContent?: string // Store unsaved content for editor tabs
    editorViewState?: unknown // Monaco's cursor, selection and scroll for the tab's file (#169)
    // For compiler tabs
    compilerState?: CompilerState
    compilerStateByProject?: Record<string, CompilerState>
    [key: string]: unknown // Per-view state (e.g. graphSubView, graphFilters)
  }
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null

  addTab: (tab: Omit<Tab, 'id'>) => string
  /**
   * Open a file: activate its tab, else turn the active empty Editor tab into it, else add a tab.
   * Returns the URL to navigate to.
   */
  openFileInTab: (filePath: string, fileName?: string) => string
  /**
   * Activate the tab for a view (creating it if there is none) and return the URL to navigate to:
   * the tab's remembered URL, or `href` for a new tab or when `href` is given as an override.
   */
  openViewTab: (type: TabType, href: string, title: string, opts?: { override?: boolean }) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  updateTabMetadata: (tabId: string, updater: (prev?: Tab['metadata']) => Tab['metadata']) => void
  getActiveTab: () => Tab | null
  getTabById: (tabId: string) => Tab | undefined
  findEditorTab: (filePath: string) => Tab | undefined
  /** Point editor tabs at a renamed/moved file or folder. Returns the active tab's new path if it was retargeted. */
  retargetEditorTabs: (oldFilePath: string, newFilePath: string) => string | null
  setTabs: (tabs: Tab[], activeTabId?: string | null) => void
}

const DEFAULT_TAB: Tab = { id: 'default-dashboard', path: '/dashboard', title: 'Dashboard', type: 'dashboard' }

const newTabId = (prefix: string) => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  } catch { /* fall back below */ }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Window event asking the open Editor to take keyboard focus (#169). */
export const FOCUS_EDITOR_EVENT = 'vw:focus-editor'

export const editorTabPath = (filePath: string) => `/editor/${encodeURIComponent(filePath)}`

/**
 * On desktop, Graph, Group and Tasks name files relative to the project while the Editor's file
 * tree uses absolute paths. Use the absolute form so one file never gets two tabs.
 */
const normalizeEditorFilePath = (filePath: string) => {
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined
  const projectPath = useProjectStore.getState().currentProjectPath
  if (!isElectron || !projectPath) return filePath
  const isAbsolute = filePath.startsWith('/') || filePath.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(filePath)
  return isAbsolute ? filePath : `${projectPath}/${filePath}`
}

export const isEmptyEditorTab = (tab: Tab | null | undefined) => !!tab && tab.type === 'editor' && !tab.metadata?.filePath

/** The path part of a tab URL, without any ?query or #hash. */
export const tabPathname = (path: string) => path.split(/[?#]/)[0]

/** Map tabs saved by older versions onto current types and paths (legacy 'threads' tabs became 'tasks'). */
const migrateTabs = (tabs: Tab[]): Tab[] =>
  tabs.map((tab) => {
    if ((tab?.type as string) === 'threads') {
      return {
        ...tab,
        type: 'tasks',
        path: typeof tab.path === 'string' ? tab.path.replace(/^\/threads\b/, '/tasks') : '/tasks',
        title: tab.title === 'Threads' ? 'Tasks' : tab.title,
      }
    }
    return tab
  })

// Tabs are saved per project by Layout (verbweaver_tabs_<project>). Drop the old global copy that
// older versions also kept, which made the previous project's tabs flash at startup.
try { localStorage.removeItem('verbweaver-tabs') } catch { /* storage unavailable */ }

export const useTabStore = create<TabState>()((set, get) => ({
  tabs: [DEFAULT_TAB],
  activeTabId: DEFAULT_TAB.id,

  addTab: (tabData) => {
    const id = newTabId('tab')
    set((state) => ({ tabs: [...state.tabs, { ...tabData, id }], activeTabId: id }))
    return id
  },

  openFileInTab: (rawFilePath, fileName) => {
    const filePath = normalizeEditorFilePath(rawFilePath)
    const { tabs, activeTabId } = get()
    const existingTab = tabs.find(tab => tab.type === 'editor' && tab.metadata?.filePath === filePath)
    if (existingTab) {
      set({ activeTabId: existingTab.id })
      return existingTab.path
    }
    const fileTab = {
      path: editorTabPath(filePath),
      title: fileName || filePath.split(/[/\\]/).pop() || filePath,
      type: 'editor' as const,
      metadata: { filePath, isModified: false },
    }
    const active = tabs.find(tab => tab.id === activeTabId)
    if (active && isEmptyEditorTab(active)) {
      // An empty Editor tab becomes the file opened in it (#164)
      set({ tabs: tabs.map(tab => (tab.id === active.id ? { ...tab, ...fileTab } : tab)) })
    } else {
      const id = newTabId('editor')
      set({ tabs: [...tabs, { ...fileTab, id }], activeTabId: id })
    }
    return fileTab.path
  },

  openViewTab: (type, href, title, opts) => {
    const { tabs, activeTabId } = get()
    const active = tabs.find(tab => tab.id === activeTabId)
    // Prefer the active tab when it is already this view (e.g. a second Graph tab), else the first one
    const existing = active?.type === type && (type !== 'editor' || isEmptyEditorTab(active))
      ? active
      : tabs.find(tab => tab.type === type && (type !== 'editor' || isEmptyEditorTab(tab)))
    if (existing) {
      set({ activeTabId: existing.id })
      return opts?.override ? href : existing.path
    }
    get().addTab({ path: href, title, type })
    return href
  },

  removeTab: (tabId) => {
    set((state) => {
      const newTabs = state.tabs.filter(tab => tab.id !== tabId)
      let newActiveId = state.activeTabId
      // If we're removing the active tab, switch to the one on its right, or its left if it was last
      if (state.activeTabId === tabId) {
        const currentIndex = state.tabs.findIndex(tab => tab.id === tabId)
        newActiveId = newTabs.length > 0 ? newTabs[Math.min(currentIndex, newTabs.length - 1)].id : null
      }
      return { tabs: newTabs, activeTabId: newActiveId }
    })
  },

  setTabs: (tabs, activeId) => {
    const next = tabs.length > 0 ? migrateTabs(tabs) : [DEFAULT_TAB]
    const active = activeId && next.some(tab => tab.id === activeId) ? activeId : next[0].id
    set(() => ({ tabs: next, activeTabId: active }))
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId })
  },

  updateTab: (tabId, updates) => {
    set((state) => ({
      tabs: state.tabs.map(tab => (tab.id === tabId ? { ...tab, ...updates } : tab)),
    }))
  },

  updateTabMetadata: (tabId, updater) => {
    set((state) => ({
      tabs: state.tabs.map(tab => (tab.id === tabId ? { ...tab, metadata: updater(tab.metadata) } : tab)),
    }))
  },

  getActiveTab: () => {
    const state = get()
    return state.tabs.find(tab => tab.id === state.activeTabId) || null
  },

  getTabById: (tabId) => get().tabs.find(t => t.id === tabId),

  findEditorTab: (filePath) =>
    get().tabs.find(tab => tab.type === 'editor' && tab.metadata?.filePath === filePath),

  retargetEditorTabs: (oldFilePath, newFilePath) => {
    const { tabs, activeTabId } = get()
    let activeNewPath: string | null = null
    const nextTabs = tabs.map(tab => {
      const fp = tab.metadata?.filePath
      if (tab.type !== 'editor' || !fp) return tab
      let nextFp: string | null = null
      if (fp === oldFilePath) nextFp = newFilePath
      else if (fp.startsWith(oldFilePath + '/')) nextFp = newFilePath + fp.slice(oldFilePath.length)
      if (!nextFp) return tab
      const nextTab: Tab = {
        ...tab,
        path: editorTabPath(nextFp),
        title: nextFp.split('/').pop() || tab.title,
        // Keep isModified/unsavedContent so pending edits are saved to the new location
        metadata: { ...tab.metadata, filePath: nextFp },
      }
      if (tab.id === activeTabId) activeNewPath = nextTab.path
      return nextTab
    })
    set({ tabs: nextTabs })
    return activeNewPath
  },
}))
