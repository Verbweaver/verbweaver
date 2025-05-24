import { create } from 'zustand'
import { ProjectConfig } from '@verbweaver/shared'
import { projectApi } from '../api/projectApi'
import toast from 'react-hot-toast'

interface ProjectState {
  projects: ProjectConfig[]
  currentProject: ProjectConfig | null
  isLoading: boolean
  error: string | null
  
  loadProjects: () => Promise<void>
  selectProject: (projectId: string) => void
  createProject: (project: Omit<ProjectConfig, 'id' | 'created' | 'modified'>) => Promise<void>
  updateProject: (projectId: string, updates: Partial<ProjectConfig>) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null })
    try {
      const projects = await projectApi.getProjects()
      set({ projects, isLoading: false })
      
      // Auto-select first project if none selected
      const state = get()
      if (!state.currentProject && projects.length > 0) {
        state.selectProject(projects[0].id)
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to load projects')
    }
  },

  selectProject: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId)
    if (project) {
      set({ currentProject: project })
      localStorage.setItem('verbweaver_active_project', projectId)
    }
  },

  createProject: async (projectData) => {
    set({ isLoading: true, error: null })
    try {
      const newProject = await projectApi.createProject(projectData)
      set(state => ({
        projects: [...state.projects, newProject],
        currentProject: newProject,
        isLoading: false
      }))
      toast.success('Project created successfully')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to create project')
    }
  },

  updateProject: async (projectId, updates) => {
    set({ isLoading: true, error: null })
    try {
      const updatedProject = await projectApi.updateProject(projectId, updates)
      set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        currentProject: state.currentProject?.id === projectId ? updatedProject : state.currentProject,
        isLoading: false
      }))
      toast.success('Project updated successfully')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to update project')
    }
  },

  deleteProject: async (projectId) => {
    set({ isLoading: true, error: null })
    try {
      await projectApi.deleteProject(projectId)
      set(state => ({
        projects: state.projects.filter(p => p.id !== projectId),
        currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        isLoading: false
      }))
      toast.success('Project deleted successfully')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      toast.error('Failed to delete project')
    }
  }
})) 