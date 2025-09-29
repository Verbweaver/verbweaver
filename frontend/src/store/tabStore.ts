import { create } from 'zustand'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { persist } from 'zustand/middleware'

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
    pageSize?: 'A4' | 'Letter' | 'A5'
    fontSize?: 'small' | 'medium' | 'large'
    margins?: 'narrow' | 'normal' | 'wide'
    lineSpacing?: 'single' | '1.5' | 'double'
  }
}

export interface Tab {
  id: string
  path: string
  title: string
  type: 'graph' | 'editor' | 'tasks' | 'version' | 'compiler' | 'dashboard' | 'settings' | 'help' | 'support'
  metadata?: {
    filePath?: string // For editor tabs
    isModified?: boolean // Track if file has unsaved changes
    unsavedContent?: string // Store unsaved content for editor tabs
    // For compiler tabs
    compilerState?: CompilerState
    compilerStateByProject?: Record<string, CompilerState>
  }
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  
  addTab: (tab: Omit<Tab, 'id'>) => string
  addEditorTab: (filePath: string, fileName: string) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  updateTabMetadata: (tabId: string, updater: (prev?: Tab['metadata']) => Tab['metadata']) => void
  getActiveTab: () => Tab | null
  getTabById: (tabId: string) => Tab | undefined
  findEditorTab: (filePath: string) => Tab | undefined
  setTabs: (tabs: Tab[], activeTabId?: string | null) => void
}

export const useTabStore = create<TabState>()(
  persist<TabState>(
    (set: any, get: any) => ({
      tabs: [
        {
          id: 'default-dashboard',
          path: '/dashboard',
          title: 'Dashboard',
          type: 'dashboard'
        }
      ],
      activeTabId: 'default-dashboard',
      
      addTab: (tabData: Omit<Tab, 'id'>) => {
        const id = `tab-${Date.now()}`
        const newTab: Tab = {
          ...tabData,
          id
        }
        
        set((state: TabState) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))
        
        return id
      },
      
      addEditorTab: (filePath: string, fileName: string) => {
        // Check if tab already exists
        const existingTab = get().tabs.find((tab: Tab) => 
          tab.type === 'editor' && tab.metadata?.filePath === filePath
        )
        
        if (existingTab) {
          set({ activeTabId: existingTab.id })
          return existingTab.id
        }
        
        // Create new editor tab
        const id = `editor-${Date.now()}`
        const newTab: Tab = {
          id,
          path: `/editor/${encodeURIComponent(filePath)}`,
          title: fileName,
          type: 'editor',
          metadata: {
            filePath,
            isModified: false
          }
        }
        
        set((state: TabState) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))
        
        return id
      },
      
      removeTab: (tabId: string) => {
        set((state: TabState) => {
          const newTabs = state.tabs.filter(tab => tab.id !== tabId)
          let newActiveId = state.activeTabId
          
          // If we're removing the active tab, switch to another one
          if (state.activeTabId === tabId) {
            const currentIndex = state.tabs.findIndex(tab => tab.id === tabId)
            if (newTabs.length > 0) {
              // Try to activate the tab to the right, or left if it was the last tab
              const newIndex = Math.min(currentIndex, newTabs.length - 1)
              newActiveId = newTabs[newIndex].id
            } else {
              newActiveId = null
            }
          }
          
          return {
            tabs: newTabs,
            activeTabId: newActiveId
          }
        })
      },
      
      setTabs: (tabs: Tab[], activeId?: string | null) => {
        set(() => ({
          tabs: tabs.length > 0 ? tabs : [{ id: 'default-dashboard', path: '/dashboard', title: 'Dashboard', type: 'dashboard' }],
          activeTabId: activeId ?? (tabs.length > 0 ? tabs[0].id : 'default-dashboard')
        }))
      },
      
      setActiveTab: (tabId: string) => {
        set({ activeTabId: tabId })
      },
      
      updateTab: (tabId: string, updates: Partial<Tab>) => {
        set((state: TabState) => ({
          tabs: state.tabs.map((tab: Tab) => 
            tab.id === tabId ? { ...tab, ...updates } : tab
          )
        }))
      },

      updateTabMetadata: (tabId: string, updater: (prev?: Tab['metadata']) => Tab['metadata']) => {
        set((state: TabState) => {
          const nextTabs = state.tabs.map((tab: Tab) => {
            if (tab.id !== tabId) return tab
            const prevMeta = tab.metadata
            const nextMeta = updater(prevMeta)
            try {
              console.log('[TabStore] updateTabMetadata', { tabId, prevMeta, nextMeta })
            } catch {}
            return { ...tab, metadata: nextMeta }
          })
          return { tabs: nextTabs }
        })
      },
      
      getActiveTab: () => {
        const state: TabState = get()
        return state.tabs.find(tab => tab.id === state.activeTabId) || null
      },

      getTabById: (tabId: string) => {
        const state: TabState = get()
        return state.tabs.find((t: Tab) => t.id === tabId)
      },
      
      findEditorTab: (filePath: string) => {
        const state: TabState = get()
        return state.tabs.find((tab: Tab) => 
          tab.type === 'editor' && tab.metadata?.filePath === filePath
        )
      }
    }),
    {
      name: 'verbweaver-tabs',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        // Map legacy 'threads' tabs to 'tasks' and update paths
        if (!persistedState || !persistedState.tabs) return persistedState
        const migrated = { ...persistedState }
        migrated.tabs = persistedState.tabs.map((tab: any) => {
          if (tab?.type === 'threads') {
            return {
              ...tab,
              type: 'tasks',
              path: typeof tab.path === 'string' ? tab.path.replace(/^\/threads\b/, '/tasks') : tab.path,
              title: tab.title === 'Threads' ? 'Tasks' : tab.title,
            }
          }
          return tab
        })
        return migrated
      }
    }
  )
)