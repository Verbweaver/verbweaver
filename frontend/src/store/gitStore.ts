import { create } from 'zustand'
import { gitApi } from '../api/gitApi'

export interface GitStatus {
  branch: string
  modified: string[]
  untracked: string[]
  deleted: string[]
  ahead: number
  behind: number
}

export interface GitCommit {
  hash: string
  author: string
  email: string
  date: string
  message: string
}

interface GitState {
  status: GitStatus | null
  commits: GitCommit[]
  isLoading: boolean
  error: string | null
  
  loadStatus: (projectId: string) => Promise<void>
  loadCommits: (projectId: string) => Promise<void>
  commit: (projectId: string, message: string, files: string[]) => Promise<void>
  push: (projectId: string) => Promise<void>
  pull: (projectId: string) => Promise<void>
}

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  commits: [],
  isLoading: false,
  error: null,

  loadStatus: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const status = await gitApi.getStatus(projectId)
      set({ status, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  loadCommits: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const commits = await gitApi.getCommits(projectId)
      set({ commits, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  commit: async (projectId: string, message: string, files: string[]) => {
    set({ isLoading: true, error: null })
    try {
      await gitApi.commit(projectId, message, files)
      // Reload status and commits
      await get().loadStatus(projectId)
      await get().loadCommits(projectId)
      set({ isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  push: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      await gitApi.push(projectId)
      await get().loadStatus(projectId)
      set({ isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  pull: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      await gitApi.pull(projectId)
      await get().loadStatus(projectId)
      await get().loadCommits(projectId)
      set({ isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  }
})) 