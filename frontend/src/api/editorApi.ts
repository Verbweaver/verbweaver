import { apiClient } from './client'

export const editorApi = {
  previewMarkdown: async (markdown: string): Promise<string> => {
    const response = await apiClient.post('/preview', markdown, {
      headers: { 'Content-Type': 'text/markdown' },
      responseType: 'text',
    })
    return response.data as string
  },
}
