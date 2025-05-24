import { ProjectConfig } from '@verbweaver/shared'
import { apiClient } from './client'

export const projectApi = {
  async getProjects(): Promise<ProjectConfig[]> {
    const response = await apiClient.get('/projects')
    return response.data
  },

  async getProject(projectId: string): Promise<ProjectConfig> {
    const response = await apiClient.get(`/projects/${projectId}`)
    return response.data
  },

  async createProject(project: Omit<ProjectConfig, 'id' | 'created' | 'modified'>): Promise<ProjectConfig> {
    const response = await apiClient.post('/projects', project)
    return response.data
  },

  async updateProject(projectId: string, updates: Partial<ProjectConfig>): Promise<ProjectConfig> {
    const response = await apiClient.put(`/projects/${projectId}`, updates)
    return response.data
  },

  async deleteProject(projectId: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}`)
  }
} 