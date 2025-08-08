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
  previewMarkdown: async (markdown: string, projectPath?: string): Promise<string> => {
    const requestBody = {
      markdown_text: markdown,
      project_path: projectPath
    }
    
    const response = await apiClient.post('/preview', requestBody, {
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
