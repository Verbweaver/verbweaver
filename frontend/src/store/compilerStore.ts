import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@verbweaver/shared'

interface CompilerState {
  selectedNodeIndices: Set<number>
  lastClickedIndex: number | null
  setSelectedIndices: (indices: Set<number>) => void
  setLastClickedIndex: (index: number | null) => void
  clearSelection: () => void
}

export const useCompilerStore = create<CompilerState>()(
  persist(
    (set) => ({
      selectedNodeIndices: new Set<number>(),
      lastClickedIndex: null,
      setSelectedIndices: (indices: Set<number>) => set({ selectedNodeIndices: indices }),
      setLastClickedIndex: (index: number | null) => set({ lastClickedIndex: index }),
      clearSelection: () => set({ selectedNodeIndices: new Set<number>(), lastClickedIndex: null }),
    }),
    {
      name: STORAGE_KEYS.COMPILER_SELECTION,
      serialize: (store) => JSON.stringify({
        state: {
          selectedNodeIndices: Array.from(store.state.selectedNodeIndices || []),
          lastClickedIndex: store.state.lastClickedIndex ?? null
        },
        version: store.version ?? 0
      }),
      deserialize: (str) => {
        try {
          const parsed = JSON.parse(str) as { state?: { selectedNodeIndices?: number[]; lastClickedIndex?: number | null }; version?: number }
          return {
            state: {
              selectedNodeIndices: new Set<number>(parsed.state?.selectedNodeIndices || []),
              lastClickedIndex: parsed.state?.lastClickedIndex ?? null
            },
            version: parsed.version ?? 0
          }
        } catch {
          return {
            state: {
              selectedNodeIndices: new Set<number>(),
              lastClickedIndex: null
            },
            version: 0
          }
        }
      }
    }
  )
)