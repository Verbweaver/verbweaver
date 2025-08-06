import { apiClient } from './client'

export interface FileNode {
  path: string
  name: string
  type: 'file' | 'directory'
  children?: FileNode[]
  metadata?: any
}

export interface FileCreate {
  path: string
  name: string
  content?: string
  metadata?: any
}

export const editorApi = {
  previewMarkdown: async (markdown: string): Promise<string> => {
    const response = await apiClient.post('/preview', markdown, {
      headers: { 'Content-Type': 'text/markdown' },
      responseType: 'text',
    })
    return response.data as string
  },

  getFileTree: async (projectId: string, path: string = ''): Promise<FileNode[]> => {
    const response = await apiClient.get(`/projects/${projectId}/tree`, {
      params: { path }
    })
    return response.data.tree || []
  },

  createFile: async (projectId: string, path: string, content: string = ''): Promise<any> => {
    const fileName = path.split('/').pop() || 'untitled.md'
    const filePath = path
    
    const response = await apiClient.post(`/projects/${projectId}/files`, {
      path: filePath,
      name: fileName,
      content: content,
      metadata: {
        type: 'file',
        created_at: new Date().toISOString()
      }
    })
    return response.data
  },
}
