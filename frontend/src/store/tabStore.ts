import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tab {
  id: string
  path: string
  title: string
  type: 'graph' | 'editor' | 'threads' | 'version' | 'compiler' | 'dashboard' | 'settings' | 'help'
  metadata?: {
    filePath?: string // For editor tabs
    isModified?: boolean // Track if file has unsaved changes
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
  getActiveTab: () => Tab | null
  findEditorTab: (filePath: string) => Tab | undefined
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [
        {
          id: 'default-dashboard',
          path: '/dashboard',
          title: 'Dashboard',
          type: 'dashboard'
        }
      ],
      activeTabId: 'default-dashboard',
      
      addTab: (tabData) => {
        const id = `tab-${Date.now()}`
        const newTab: Tab = {
          ...tabData,
          id
        }
        
        set(state => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))
        
        return id
      },
      
      addEditorTab: (filePath: string, fileName: string) => {
        // Check if tab already exists
        const existingTab = get().tabs.find(tab => 
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
        
        set(state => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))
        
        return id
      },
      
      removeTab: (tabId) => {
        set(state => {
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
      
      setActiveTab: (tabId) => {
        set({ activeTabId: tabId })
      },
      
      updateTab: (tabId, updates) => {
        set(state => ({
          tabs: state.tabs.map(tab => 
            tab.id === tabId ? { ...tab, ...updates } : tab
          )
        }))
      },
      
      getActiveTab: () => {
        const state = get()
        return state.tabs.find(tab => tab.id === state.activeTabId) || null
      },
      
      findEditorTab: (filePath: string) => {
        const state = get()
        return state.tabs.find(tab => 
          tab.type === 'editor' && tab.metadata?.filePath === filePath
        )
      }
    }),
    {
      name: 'verbweaver-tabs'
    }
  )
) 