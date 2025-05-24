import { create } from 'zustand'
import { GraphNode, GraphEdge } from '@verbweaver/shared'
import { graphApi } from '../api/graphApi'

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  isLoading: boolean
  error: string | null
  
  loadGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  saveNodePosition: (projectId: string, nodeId: string, position: { x: number; y: number }) => Promise<void>
  createNode: (projectId: string, node: GraphNode) => Promise<void>
  updateNode: (projectId: string, nodeId: string, updates: Partial<GraphNode>) => Promise<void>
  deleteNode: (projectId: string, nodeId: string) => Promise<void>
  createEdge: (projectId: string, edge: GraphEdge) => Promise<void>
  deleteEdge: (projectId: string, edgeId: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,

  loadGraph: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const { nodes, edges } = await graphApi.getGraph(projectId)
      set({ nodes, edges, isLoading: false })
      return { nodes, edges }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  saveNodePosition: async (projectId: string, nodeId: string, position: { x: number; y: number }) => {
    try {
      await graphApi.updateNodePosition(projectId, nodeId, position)
      set(state => ({
        nodes: state.nodes.map(n => n.id === nodeId ? { ...n, position } : n)
      }))
    } catch (error) {
      console.error('Failed to save node position:', error)
    }
  },

  createNode: async (projectId: string, node: GraphNode) => {
    set({ isLoading: true, error: null })
    try {
      const newNode = await graphApi.createNode(projectId, node)
      set(state => ({
        nodes: [...state.nodes, newNode],
        isLoading: false
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  updateNode: async (projectId: string, nodeId: string, updates: Partial<GraphNode>) => {
    set({ isLoading: true, error: null })
    try {
      const updatedNode = await graphApi.updateNode(projectId, nodeId, updates)
      set(state => ({
        nodes: state.nodes.map(n => n.id === nodeId ? updatedNode : n),
        isLoading: false
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  deleteNode: async (projectId: string, nodeId: string) => {
    set({ isLoading: true, error: null })
    try {
      await graphApi.deleteNode(projectId, nodeId)
      set(state => ({
        nodes: state.nodes.filter(n => n.id !== nodeId),
        edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
        isLoading: false
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  createEdge: async (projectId: string, edge: GraphEdge) => {
    set({ isLoading: true, error: null })
    try {
      const newEdge = await graphApi.createEdge(projectId, edge)
      set(state => ({
        edges: [...state.edges, newEdge],
        isLoading: false
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  deleteEdge: async (projectId: string, edgeId: string) => {
    set({ isLoading: true, error: null })
    try {
      await graphApi.deleteEdge(projectId, edgeId)
      set(state => ({
        edges: state.edges.filter(e => e.id !== edgeId),
        isLoading: false
      }))
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  }
})) 