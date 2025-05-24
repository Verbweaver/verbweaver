import { apiClient } from './client'

interface FileResponse {
  id: string
  name: string
  path: string
  content: string
  metadata?: any
}

export const editorApi = {
  async getFile(projectId: string, fileId: string): Promise<FileResponse> {
    const response = await apiClient.get(`/editor/${projectId}/files/${fileId}`)
    return response.data
  },

  async saveFile(projectId: string, fileId: string, content: string): Promise<void> {
    await apiClient.put(`/editor/${projectId}/files/${fileId}`, { content })
  },

  async createFile(projectId: string, path: string, content: string): Promise<FileResponse> {
    const response = await apiClient.post(`/editor/${projectId}/files`, { path, content })
    return response.data
  },

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    await apiClient.delete(`/editor/${projectId}/files/${fileId}`)
  },

  async getFileTree(projectId: string): Promise<any> {
    const response = await apiClient.get(`/editor/${projectId}/tree`)
    return response.data
  }
} 