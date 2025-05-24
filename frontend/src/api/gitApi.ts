import { GitStatus, GitCommit } from '../store/gitStore'
import { apiClient } from './client'

export const gitApi = {
  async getStatus(projectId: string): Promise<GitStatus> {
    const response = await apiClient.get(`/git/${projectId}/status`)
    return response.data
  },

  async getCommits(projectId: string, limit: number = 50): Promise<GitCommit[]> {
    const response = await apiClient.get(`/git/${projectId}/log`, {
      params: { limit }
    })
    return response.data
  },

  async commit(projectId: string, message: string, files: string[]): Promise<void> {
    await apiClient.post(`/git/${projectId}/commit`, { 
      message, 
      files 
    })
  },

  async push(projectId: string): Promise<void> {
    await apiClient.post(`/git/${projectId}/push`)
  },

  async pull(projectId: string): Promise<void> {
    await apiClient.post(`/git/${projectId}/pull`)
  },

  async createBranch(projectId: string, branchName: string): Promise<void> {
    await apiClient.post(`/git/${projectId}/branch`, { 
      name: branchName 
    })
  },

  async checkoutBranch(projectId: string, branchName: string): Promise<void> {
    await apiClient.post(`/git/${projectId}/checkout`, { 
      branch: branchName 
    })
  }
} 