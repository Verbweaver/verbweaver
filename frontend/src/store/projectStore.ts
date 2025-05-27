import { create } from 'zustand'
import { ProjectConfig } from '@verbweaver/shared'
import { projectApi } from '../api/projectApi'
import toast from 'react-hot-toast'
import { useAuthStore } from '../services/auth'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

interface ProjectState {
  projects: ProjectConfig[]
  currentProject: ProjectConfig | null
  currentProjectPath: string | null  // For Electron projects
  isLoading: boolean
  error: string | null
  
  loadProjects: () => Promise<void>
  selectProject: (projectId: string) => void
  setCurrentProjectPath: (path: string, name?: string) => void  // For Electron
  createProject: (project: Omit<ProjectConfig, 'id' | 'created' | 'modified'>) => Promise<void>
  updateProject: (projectId: string, updates: Partial<ProjectConfig>) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentProjectPath: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    if (isElectron) {
      set({ projects: [], isLoading: false })
      console.log('[ProjectStore] Electron environment, skipping API project load.');
      return
    }

    // For web: check auth status from useAuthStore
    const { isAuthenticated, isHydrated } = useAuthStore.getState()

    if (!isHydrated) {
      console.log('[ProjectStore] Auth not hydrated yet. Aborting loadProjects.');
      // Optionally set an error or specific loading state if needed
      // set({ error: 'Authentication not ready', isLoading: false });
      return; 
    }

    if (!isAuthenticated) {
      console.log('[ProjectStore] User not authenticated. Aborting loadProjects.');
      // set({ error: 'User not authenticated', isLoading: false, projects: [] });
      // No need to toast here as App.tsx/ProtectedRoute should handle redirection to login
      return; 
    }

    console.log('[ProjectStore] Auth hydrated and user authenticated. Proceeding to load projects.');
    set({ isLoading: true, error: null })
    try {
      const projects = await projectApi.getProjects()
      set({ projects, isLoading: false })
      const state = get()
      if (!state.currentProject && projects.length > 0) {
        state.selectProject(projects[0].id)
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[ProjectStore] Failed to load projects:', errorMessage);
      set({ error: errorMessage, isLoading: false })
      // Avoid toast here if the error is 401, as apiClient's interceptor will redirect.
      // Only toast for other types of errors.
      if (!(error as any).response || (error as any).response.status !== 401) {
        toast.error('Failed to load projects: ' + errorMessage)
      }
    }
  },

  selectProject: (projectId: string) => {
    const project = get().projects.find(p => p.id === projectId)
    if (project) {
      set({ currentProject: project })
      localStorage.setItem('verbweaver_active_project', projectId)
    }
  },

  setCurrentProjectPath: (path: string, name?: string) => {
    // For Electron projects, set the current project path
    const projectName = name || path.split(/[/\\]/).pop() || 'Unknown Project'
    const mockProject: ProjectConfig = {
      id: path, // Use path as ID for Electron projects
      name: projectName,
      description: `Local project at ${path}`,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      settings: {},
      gitRepository: {
        url: '',
        branch: 'main',
        type: 'local'
      }
    }
    
    set({ 
      currentProject: mockProject,
      currentProjectPath: path 
    })
    
    localStorage.setItem('verbweaver_active_project_path', path)
    toast.success(`Opened project: ${projectName}`)
  },

  createProject: async (projectData) => {
    set({ isLoading: true, error: null })
    try {
      if (isElectron) {
        // For Electron, project creation is handled by the main process
        // We just update the local state
        set({ isLoading: false })
        return
      }
      
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