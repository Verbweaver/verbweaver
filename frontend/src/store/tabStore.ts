import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tab {
  id: string
  path: string
  title: string
  type: 'graph' | 'editor' | 'threads' | 'version' | 'compiler' | 'dashboard' | 'settings' | 'help'
  metadata?: {
    filePath?: string // For editor tabs
  }
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  
  addTab: (tab: Omit<Tab, 'id'>) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  getActiveTab: () => Tab | null
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
      }
    }),
    {
      name: 'verbweaver-tabs'
    }
  )
) 