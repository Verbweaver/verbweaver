import { apiClient } from './client'

interface CompileOptions {
  title: string
  author: string
  format: string
  nodes: string[]
  template?: string
  custom_variables?: Record<string, any>
  options: {
    includeMetadata?: boolean
    includeTOC?: boolean
    embedUploadedFiles?: boolean
  }
}

interface Template {
  name: string
  path: string
  format: string
}

interface TemplateContent {
  content: string
  is_valid: boolean
  custom_variables: string[]
  schema?: any
  messages?: string[]
  // Layout values from the template's front matter, used to pre-fill the Compiler (#52)
  layout_defaults?: { mainfont?: string | null }
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

  async getTemplates(projectId: string, format?: string): Promise<Template[]> {
    const params = format ? { format_type: format } : {}
    const response = await apiClient.get(`/compiler/${projectId}/templates`, { params })
    return response.data.templates
  },

  async getTemplateContent(projectId: string, templatePath: string): Promise<TemplateContent> {
    const response = await apiClient.get(`/compiler/${projectId}/templates/${templatePath}`)
    return response.data
  },

  /** Fonts installed on the machine that runs exports (#52). */
  async getFonts(refresh = false): Promise<string[]> {
    const response = await apiClient.get('/compiler/fonts', { params: refresh ? { refresh: true } : {} })
    return Array.isArray(response.data?.fonts) ? response.data.fonts : []
  },

  async preview(projectId: string, nodeId: string, format: string): Promise<string> {
    const response = await apiClient.get(`/compiler/${projectId}/preview/${nodeId}`, {
      params: { format }
    })
    return response.data
  }
} 