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
      // Custom serialization for Set
      serialize: (state) => JSON.stringify({
        ...state,
        selectedNodeIndices: Array.from(state.selectedNodeIndices || [])
      }),
              deserialize: (str) => {
          try {
            const parsed = JSON.parse(str)
            return {
              ...parsed,
              selectedNodeIndices: new Set(parsed.selectedNodeIndices || [])
            }
          } catch (error) {
            // If deserialization fails, return default state
            return {
              selectedNodeIndices: new Set(),
              lastClickedIndex: null
            }
          }
        }
    }
  )
) 