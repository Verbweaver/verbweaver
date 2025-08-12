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
      selectedNodeIndices: new Set(),
      lastClickedIndex: null,
      setSelectedIndices: (indices) => set({ selectedNodeIndices: indices }),
      setLastClickedIndex: (index) => set({ lastClickedIndex: index }),
      clearSelection: () => set({ selectedNodeIndices: new Set(), lastClickedIndex: null }),
    }),
    {
      name: STORAGE_KEYS.COMPILER_SELECTION,
      serialize: (state) => JSON.stringify({
        selectedNodeIndices: Array.from(state.selectedNodeIndices || []),
        lastClickedIndex: state.lastClickedIndex
      }),
      deserialize: (str) => {
        try {
          const parsed = JSON.parse(str) as { selectedNodeIndices?: number[]; lastClickedIndex?: number | null }
          return {
            state: {
              selectedNodeIndices: new Set(parsed.selectedNodeIndices || []),
              lastClickedIndex: parsed.lastClickedIndex ?? null
            }
          }
        } catch {
          return {
            state: {
              selectedNodeIndices: new Set(),
              lastClickedIndex: null
            }
          }
        }
      }
    }
  )
) 