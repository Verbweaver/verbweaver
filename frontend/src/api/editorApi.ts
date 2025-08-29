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
  previewMarkdown: async (markdown: string, projectPath?: string, filePath?: string): Promise<string> => {
    const requestBody = {
      markdown_text: markdown,
      project_path: projectPath,
      file_path: filePath
    }
    
    const response = await apiClient.post('/preview', requestBody, {
      responseType: 'text',
    })
    return response.data as string
  },

  getFileTree: async (projectId: string, path: string = ''): Promise<FileNode[]> => {
    const response = await apiClient.get(`/editor/${projectId}/tree`, {
      params: { path }
    })
    return response.data.tree || []
  },

  getFile: async (projectId: string, path: string): Promise<{ path: string; name: string; content: string; metadata?: any }> => {
    const normalize = (p: string) => p.replace(/\\/g, '/');
    const encodePath = (p: string) => normalize(p).split('/').map(seg => encodeURIComponent(seg)).join('/');
    const response = await apiClient.get(`/editor/${projectId}/files/${encodePath(path)}`)
    return response.data
  },

  writeFile: async (projectId: string, path: string, content: string, metadata?: any): Promise<any> => {
    const normalize = (p: string) => p.replace(/\\/g, '/');
    const encodePath = (p: string) => normalize(p).split('/').map(seg => encodeURIComponent(seg)).join('/');
    const response = await apiClient.put(`/editor/${projectId}/files/${encodePath(path)}`, {
      content,
      metadata,
    })
    return response.data
  },

  createFile: async (projectId: string, path: string, content: string = ''): Promise<any> => {
    const fileName = path.split('/').pop() || 'untitled.md'
    const filePath = path
    
    const response = await apiClient.post(`/editor/${projectId}/files`, {
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

  searchFiles: async (
    projectId: string,
    params: { query: string; regex?: boolean; caseSensitive?: boolean }
  ): Promise<{ results: Array<{ path: string; count: number }>; count: number }> => {
    const response = await apiClient.post(`/editor/${projectId}/search`, {
      query: params.query,
      regex: Boolean(params.regex),
      case_sensitive: Boolean(params.caseSensitive),
    })
    return response.data
  },
}
