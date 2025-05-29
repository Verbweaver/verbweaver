import { apiClient } from './client'

export interface Template {
  path: string
  name: string
  metadata: {
    title: string
    type: string
    description?: string
    tags?: string[]
    task?: {
      status: string
      priority: string
      assignee?: string
      dueDate?: string
      completedDate?: string
      description?: string
    }
  }
  content: string
}

export interface CreateTemplateData {
  source_node_path: string
  template_name: string
}

export interface CreateNodeFromTemplateData {
  template_path: string
  node_name: string
  parent_path?: string
  initial_metadata?: Record<string, any>
}

export const templatesApi = {
  // List all templates in a project
  listTemplates: async (projectId: string): Promise<Template[]> => {
    const response = await apiClient.get(`/projects/${projectId}/templates`)
    return response.data
  },

  // Save a node as a template
  saveAsTemplate: async (projectId: string, data: CreateTemplateData): Promise<Template> => {
    const response = await apiClient.post(`/projects/${projectId}/templates`, data)
    return response.data
  },

  // Create a node from a template
  createNodeFromTemplate: async (projectId: string, data: CreateNodeFromTemplateData): Promise<any> => {
    const response = await apiClient.post(`/projects/${projectId}/nodes/from-template`, data)
    return response.data
  },

  // Delete a template
  deleteTemplate: async (projectId: string, templateName: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/templates/${templateName}`)
  },
} 