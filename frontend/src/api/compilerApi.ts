import { apiClient } from './client'

interface CompileOptions {
  title: string
  author: string
  format: string
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

export const compilerApi = {
  async compile(projectId: string, options: CompileOptions): Promise<CompileResult> {
    const response = await apiClient.post(`/compiler/${projectId}/compile`, options)
    return response.data
  },

  async getTemplates(projectId: string): Promise<any[]> {
    const response = await apiClient.get(`/compiler/${projectId}/templates`)
    return response.data
  },

  async preview(projectId: string, nodeId: string, format: string): Promise<string> {
    const response = await apiClient.get(`/compiler/${projectId}/preview/${nodeId}`, {
      params: { format }
    })
    return response.data
  }
} 