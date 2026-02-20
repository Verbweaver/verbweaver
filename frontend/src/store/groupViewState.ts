import { create } from 'zustand'
import type { NodeFilterState } from '../components/NodeFiltersDialog'

export type GroupDefinition = {
  id: string
  name: string
  enabled: boolean
  color?: string
  filters: NodeFilterState
}

export type GroupViewOptions = {
  nestGroups: boolean
  showNodeCards?: boolean
  maxCardsPerGroup?: number
  showCapIndicator?: boolean
}

export type GroupViewLayout = {
  boxes: Record<string, { x: number; y: number; w?: number; h?: number }>
}

export type GroupViewPersisted = {
  version: 1
  groups: GroupDefinition[]
  options: GroupViewOptions
  layout: GroupViewLayout
}

const defaultPersisted = (): GroupViewPersisted => ({
  version: 1,
  groups: [],
  options: { nestGroups: false, showNodeCards: false, maxCardsPerGroup: 40, showCapIndicator: true },
  layout: { boxes: {} },
})

export const groupStorageKey = (projectId: string, tabId: string) => `vw:groupview:${projectId}:${tabId}`

type GroupViewStore = {
  groups: GroupDefinition[]
  options: GroupViewOptions
  layout: GroupViewLayout

  setGroups: (groups: GroupDefinition[]) => void
  addGroup: (group: GroupDefinition) => void
  updateGroup: (groupId: string, updates: Partial<GroupDefinition>) => void
  removeGroup: (groupId: string) => void

  setOptions: (options: Partial<GroupViewOptions>) => void
  setBoxLayout: (boxId: string, pos: { x: number; y: number; w?: number; h?: number }) => void

  loadFromStorage: (projectId: string, tabId: string) => void
  saveToStorage: (projectId: string, tabId: string) => void
  exportConfig: () => GroupViewPersisted
  importConfig: (cfg: GroupViewPersisted) => void
}

export const useGroupViewStore = create<GroupViewStore>((set, get) => ({
  groups: [],
  options: { nestGroups: false, showNodeCards: false, maxCardsPerGroup: 40, showCapIndicator: true },
  layout: { boxes: {} },

  setGroups: (groups) => set({ groups }),
  addGroup: (group) => set((s) => ({ groups: [...s.groups, group] })),
  updateGroup: (groupId, updates) => set((s) => ({
    groups: s.groups.map(g => (g.id === groupId ? { ...g, ...updates } : g)),
  })),
  removeGroup: (groupId) => set((s) => ({ groups: s.groups.filter(g => g.id !== groupId) })),

  setOptions: (options) => set((s) => ({ options: { ...s.options, ...options } })),
  setBoxLayout: (boxId, pos) => set((s) => ({ layout: { ...s.layout, boxes: { ...s.layout.boxes, [boxId]: pos } } })),

  loadFromStorage: (projectId, tabId) => {
    try {
      const raw = localStorage.getItem(groupStorageKey(projectId, tabId))
      if (!raw) return
      const parsed = JSON.parse(raw) as GroupViewPersisted
      if (!parsed || parsed.version !== 1) return
      set({
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        options: {
          nestGroups: !!parsed.options?.nestGroups,
          showNodeCards: !!parsed.options?.showNodeCards,
          maxCardsPerGroup: typeof parsed.options?.maxCardsPerGroup === 'number' && parsed.options.maxCardsPerGroup > 0 ? Math.min(200, parsed.options.maxCardsPerGroup) : 40,
          showCapIndicator: parsed.options?.showCapIndicator !== false,
        },
        layout: parsed.layout && parsed.layout.boxes ? parsed.layout : { boxes: {} },
      })
    } catch {
      // ignore
    }
  },
  saveToStorage: (projectId, tabId) => {
    try {
      const cfg: GroupViewPersisted = {
        version: 1,
        groups: get().groups,
        options: get().options,
        layout: get().layout,
      }
      localStorage.setItem(groupStorageKey(projectId, tabId), JSON.stringify(cfg))
    } catch {
      // ignore
    }
  },
  exportConfig: () => {
    const cfg: GroupViewPersisted = {
      version: 1,
      groups: get().groups,
      options: get().options,
      layout: get().layout,
    }
    return cfg
  },
  importConfig: (cfg) => {
    if (!cfg || cfg.version !== 1) return
    // Enforce max 50 groups when importing
    const groups = Array.isArray(cfg.groups) ? cfg.groups.slice(0, 50).map((g: any) => ({
      id: String(g?.id || ''),
      name: String(g?.name || ''),
      enabled: !!g?.enabled,
      color: g?.color ? String(g.color) : undefined,
      filters: (g && g.filters ? g.filters : ({} as any)) as NodeFilterState,
    })) : []
    const options = {
      nestGroups: !!cfg.options?.nestGroups,
      showNodeCards: !!cfg.options?.showNodeCards,
      maxCardsPerGroup: typeof cfg.options?.maxCardsPerGroup === 'number' && cfg.options.maxCardsPerGroup > 0 ? Math.min(200, cfg.options.maxCardsPerGroup) : 40,
      showCapIndicator: cfg.options?.showCapIndicator !== false,
    }
    const layout = cfg.layout && cfg.layout.boxes ? cfg.layout : { boxes: {} }
    set({ groups, options, layout })
  },
}))


