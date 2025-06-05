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
  template_name: string
  node_name: string
  parent_path?: string
  initial_metadata?: Record<string, any>
}

// Helper to clean project identifier for API calls
const cleanProjectIdentifier = (identifier: string): string => {
  // If it's a path (contains slashes or backslashes), take the last part
  if (identifier.includes('\\') || identifier.includes('/')) {
    const parts = identifier.split(/[/\\]/);
    return parts[parts.length - 1];
  }
  return identifier;
};

// Helper to extract template name from path
const extractTemplateName = (templatePath: string): string => {
  // Remove 'templates/' prefix and '.md' extension
  return templatePath
    .replace(/^templates\//, '')
    .replace(/\.md$/, '');
};

export const templatesApi = {
  // List all templates in a project
  listTemplates: async (projectId: string): Promise<Template[]> => {
    try {
      const cleanId = cleanProjectIdentifier(projectId);
      const response = await apiClient.get(`/projects/${encodeURIComponent(cleanId)}/templates`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to list templates:', error.response?.data || error.message);
      throw error;
    }
  },

  // Save a node as a template
  saveAsTemplate: async (projectId: string, data: CreateTemplateData): Promise<Template> => {
    try {
      const cleanId = cleanProjectIdentifier(projectId);
      const response = await apiClient.post(`/projects/${encodeURIComponent(cleanId)}/templates`, data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to save template:', error.response?.data || error.message);
      throw error;
    }
  },

  // Create a node from a template
  createNodeFromTemplate: async (projectId: string, data: CreateNodeFromTemplateData): Promise<any> => {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    try {
      // For desktop mode, we need to use the project name as the ID
      const cleanId = cleanProjectIdentifier(projectId);
      
      console.log('Making API request with:', {
        url: `/projects/${encodeURIComponent(cleanId)}/nodes/from-template`,
        data,
        originalId: projectId,
        cleanId
      });
      
      const response = await apiClient.post(
        `/projects/${encodeURIComponent(cleanId)}/nodes/from-template`,
        data
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to create node from template:', error.response?.data || error.message);
      throw error;
    }
  },

  // Delete a template
  deleteTemplate: async (projectId: string, templateName: string): Promise<void> => {
    try {
      const cleanId = cleanProjectIdentifier(projectId);
      await apiClient.delete(
        `/projects/${encodeURIComponent(cleanId)}/templates/${encodeURIComponent(templateName)}`
      );
    } catch (error: any) {
      console.error('Failed to delete template:', error.response?.data || error.message);
      throw error;
    }
  },
} 