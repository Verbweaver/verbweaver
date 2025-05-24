import { GraphNode, GraphEdge } from '@verbweaver/shared'
import { apiClient } from './client'

export const graphApi = {
  async getGraph(projectId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const response = await apiClient.get(`/graph/${projectId}`)
    return response.data
  },

  async createNode(projectId: string, node: GraphNode): Promise<GraphNode> {
    const response = await apiClient.post(`/graph/${projectId}/nodes`, node)
    return response.data
  },

  async updateNode(projectId: string, nodeId: string, updates: Partial<GraphNode>): Promise<GraphNode> {
    const response = await apiClient.put(`/graph/${projectId}/nodes/${nodeId}`, updates)
    return response.data
  },

  async updateNodePosition(projectId: string, nodeId: string, position: { x: number; y: number }): Promise<void> {
    await apiClient.patch(`/graph/${projectId}/nodes/${nodeId}/position`, position)
  },

  async deleteNode(projectId: string, nodeId: string): Promise<void> {
    await apiClient.delete(`/graph/${projectId}/nodes/${nodeId}`)
  },

  async createEdge(projectId: string, edge: GraphEdge): Promise<GraphEdge> {
    const response = await apiClient.post(`/graph/${projectId}/edges`, edge)
    return response.data
  },

  async deleteEdge(projectId: string, edgeId: string): Promise<void> {
    await apiClient.delete(`/graph/${projectId}/edges/${edgeId}`)
  }
} 