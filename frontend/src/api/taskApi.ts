import { Task } from '@verbweaver/shared'
import { apiClient } from './client'

export const taskApi = {
  async getTasks(projectId: string): Promise<Task[]> {
    const response = await apiClient.get(`/tasks/${projectId}`)
    return response.data
  },

  async getTask(projectId: string, taskId: string): Promise<Task> {
    const response = await apiClient.get(`/tasks/${projectId}/${taskId}`)
    return response.data
  },

  async createTask(projectId: string, task: Omit<Task, 'id' | 'created' | 'updated'>): Promise<Task> {
    const response = await apiClient.post(`/tasks/${projectId}`, task)
    return response.data
  },

  async updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    const response = await apiClient.put(`/tasks/${projectId}/${taskId}`, updates)
    return response.data
  },

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await apiClient.delete(`/tasks/${projectId}/${taskId}`)
  }
} 