import { create } from 'zustand'
import { editorApi } from '../api/editorApi'

export interface EditorFile {
  id: string
  name: string
  path: string
  content: string
  language?: string
}

interface EditorState {
  openFiles: EditorFile[]
  currentFile: EditorFile | null
  isLoading: boolean
  error: string | null
  
  loadFile: (projectId: string, fileId: string) => Promise<EditorFile>
  saveFile: (projectId: string, fileId: string, content: string) => Promise<void>
  openFile: (file: EditorFile) => void
  closeFile: (fileId: string) => void
  updateFileContent: (fileId: string, content: string) => void
  setCurrentFile: (fileId: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  currentFile: null,
  isLoading: false,
  error: null,

  loadFile: async (projectId: string, fileId: string) => {
    set({ isLoading: true, error: null })
    try {
      const file = await editorApi.getFile(projectId, fileId)
      const editorFile: EditorFile = {
        id: file.id,
        name: file.name,
        path: file.path,
        content: file.content,
        language: file.path.endsWith('.md') ? 'markdown' : 'plaintext'
      }
      
      // Add to open files if not already open
      const state = get()
      if (!state.openFiles.find(f => f.id === fileId)) {
        set(state => ({
          openFiles: [...state.openFiles, editorFile],
          currentFile: editorFile,
          isLoading: false
        }))
      } else {
        set({ currentFile: editorFile, isLoading: false })
      }
      
      return editorFile
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  saveFile: async (projectId: string, fileId: string, content: string) => {
    set({ isLoading: true, error: null })
    try {
      await editorApi.saveFile(projectId, fileId, content)
      set({ isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  openFile: (file: EditorFile) => {
    set(state => {
      const existingFile = state.openFiles.find(f => f.id === file.id)
      if (!existingFile) {
        return {
          openFiles: [...state.openFiles, file],
          currentFile: file
        }
      }
      return { currentFile: file }
    })
  },

  closeFile: (fileId: string) => {
    set(state => {
      const newOpenFiles = state.openFiles.filter(f => f.id !== fileId)
      const newCurrentFile = state.currentFile?.id === fileId
        ? newOpenFiles[newOpenFiles.length - 1] || null
        : state.currentFile
      
      return {
        openFiles: newOpenFiles,
        currentFile: newCurrentFile
      }
    })
  },

  updateFileContent: (fileId: string, content: string) => {
    set(state => ({
      openFiles: state.openFiles.map(f =>
        f.id === fileId ? { ...f, content } : f
      ),
      currentFile: state.currentFile?.id === fileId
        ? { ...state.currentFile, content }
        : state.currentFile
    }))
  },

  setCurrentFile: (fileId: string) => {
    set(state => {
      const file = state.openFiles.find(f => f.id === fileId)
      return { currentFile: file || null }
    })
  }
})) 