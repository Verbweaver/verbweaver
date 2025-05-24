import { create } from 'zustand'
import { compilerApi } from '../api/compilerApi'
import { ExportFormat } from '@verbweaver/shared'

interface CompileOptions {
  title: string
  author: string
  format: ExportFormat
  nodes: string[]
  options: {
    includeMetadata?: boolean
    includeTOC?: boolean
    template?: string
  }
}

interface CompileResult {
  filename: string
  downloadUrl: string
  size: number
}

interface CompilerState {
  selectedNodes: string[]
  exportFormat: ExportFormat
  isCompiling: boolean
  error: string | null
  
  compile: (projectId: string, options: CompileOptions) => Promise<CompileResult>
  setExportFormat: (format: ExportFormat) => void
  toggleNodeSelection: (nodeId: string) => void
  selectAllNodes: () => void
  clearSelection: () => void
}

export const useCompilerStore = create<CompilerState>((set) => ({
  selectedNodes: [],
  exportFormat: 'pdf',
  isCompiling: false,
  error: null,

  compile: async (projectId: string, options: CompileOptions) => {
    set({ isCompiling: true, error: null })
    try {
      const result = await compilerApi.compile(projectId, options)
      set({ isCompiling: false })
      return result
    } catch (error) {
      set({ error: (error as Error).message, isCompiling: false })
      throw error
    }
  },

  setExportFormat: (format: ExportFormat) => {
    set({ exportFormat: format })
  },

  toggleNodeSelection: (nodeId: string) => {
    set(state => ({
      selectedNodes: state.selectedNodes.includes(nodeId)
        ? state.selectedNodes.filter(id => id !== nodeId)
        : [...state.selectedNodes, nodeId]
    }))
  },

  selectAllNodes: () => {
    // This would be implemented with actual node data
    set({ selectedNodes: [] })
  },

  clearSelection: () => {
    set({ selectedNodes: [] })
  }
})) 