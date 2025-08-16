import { apiClient } from './client'

export interface GitConfig {
  type: 'local' | 'remote'
  path?: string | null
  url?: string | null
  branch: string
  autoPush: boolean
  credentials?: Record<string, string>
}

export interface ProjectCreate {
  name: string
  description?: string
  git_config: GitConfig
  settings?: Record<string, any>
}

export interface ProjectUpdate {
  name?: string
  description?: string
  git_config?: GitConfig
  settings?: Record<string, any>
}

export interface Project {
  id: string
  name: string
  description?: string
  user_id: string
  git_config: GitConfig
  settings: Record<string, any>
  created_at: string
  updated_at?: string
}

export const projectsApi = {
  // Get all projects for the current user
  getProjects: async (skip = 0, limit = 100): Promise<Project[]> => {
    const response = await apiClient.get('/projects', {
      params: { skip, limit }
    })
    return response.data
  },

  // Get a specific project
  getProject: async (projectId: string): Promise<Project> => {
    const response = await apiClient.get(`/projects/${projectId}`)
    return response.data
  },

  // Create a new project
  createProject: async (data: ProjectCreate): Promise<Project> => {
    const response = await apiClient.post('/projects', data)
    return response.data
  },

  // Update a project
  updateProject: async (projectId: string, data: ProjectUpdate): Promise<Project> => {
    const response = await apiClient.put(`/projects/${projectId}`, data)
    return response.data
  },

  // Delete a project
  deleteProject: async (projectId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}`)
  },

  // Get project settings
  getProjectSettings: async (projectId: string): Promise<Record<string, any>> => {
    const response = await apiClient.get(`/projects/${projectId}/settings`)
    return response.data.settings
  },

  // Update project settings
  updateProjectSettings: async (projectId: string, settings: Record<string, any>): Promise<void> => {
    await apiClient.put(`/projects/${projectId}/settings`, settings)
  },

  // Get compiler settings
  getCompilerSettings: async (projectId: string): Promise<Record<string, any>> => {
    const response = await apiClient.get(`/projects/${projectId}/settings/compiler`)
    return response.data.compiler
  },

  // Update compiler settings
  updateCompilerSettings: async (projectId: string, compilerSettings: Record<string, any>): Promise<void> => {
    await apiClient.put(`/projects/${projectId}/settings/compiler`, compilerSettings)
  },

  // Get tasks settings (fallback to legacy threads)
  getTasksSettings: async (projectId: string): Promise<Record<string, any>> => {
    try {
      const response = await apiClient.get(`/projects/${projectId}/settings/tasks`)
      return response.data.tasks
    } catch (e: any) {
      // Fallback to legacy
      const response = await apiClient.get(`/projects/${projectId}/settings/threads`)
      return response.data.threads
    }
  },

  // Update tasks settings (also mirror to legacy for one release)
  updateTasksSettings: async (projectId: string, tasksSettings: Record<string, any>): Promise<void> => {
    try {
      await apiClient.put(`/projects/${projectId}/settings/tasks`, tasksSettings)
    } finally {
      // Best-effort legacy mirror
      try { await apiClient.put(`/projects/${projectId}/settings/threads`, tasksSettings) } catch {}
    }
  },

  // Re-seed templates (README, node, compiler) into an existing project
  reseedTemplates: async (projectId: string): Promise<void> => {
    await apiClient.post(`/projects/${projectId}/templates/reseed`)
  },
} 