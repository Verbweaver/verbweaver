import { create } from 'zustand'
import { GraphNode, GraphEdge } from '@verbweaver/shared'
import { graphApi } from '../api/graphApi'
// import { useProjectStore } from './projectStore' // Not strictly needed here if projectId is passed

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null // Keep this if you have selection logic
  isLoading: boolean
  error: string | null
  
  loadGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  saveNodePosition: (projectId: string, nodeId: string, position: { x: number; y: number }) => Promise<void>
  createNode: (projectId: string, node: Omit<GraphNode, 'id'>) => Promise<GraphNode | null> // Adjusted for potential Electron creation
  updateNode: (projectId: string, nodeId: string, updates: Partial<GraphNode>) => Promise<void>
  deleteNode: (projectId: string, nodeId: string) => Promise<void>
  createEdge: (projectId: string, edge: Omit<GraphEdge, 'id'>) => Promise<GraphEdge | null> // Adjusted
  deleteEdge: (projectId: string, edgeId: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,

  loadGraph: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      let loadedNodes: GraphNode[] = [];
      let loadedEdges: GraphEdge[] = [];

      if (isElectron && window.electronAPI?.loadGraphData) {
        const result = await window.electronAPI.loadGraphData();
        loadedNodes = result.nodes.map((n: any) => {
          const nodeTitle = n.label || n.id.replace(/\.md$/, '').split('/').pop() || 'Untitled Node';
          return {
            id: n.id, 
            label: nodeTitle, // label is often used for display in graph libraries
            title: nodeTitle, // Explicitly map to title property
            type: n.type || 'document',
            position: n.position,
            data: n.data || {}, // This is the raw frontmatter + content from main.ts
            metadata: n.data?.frontmatter || n.data || {}, // Use n.data (frontmatter) as metadata. If n.data has a specific frontmatter sub-property, use that.
                                                         // Assuming n.data IS the frontmatter object based on main.ts `graph:loadData`
            status: n.data?.status, 
            created: n.data?.created || new Date().toISOString(),
            modified: n.data?.modified || new Date().toISOString(),
            tags: n.data?.tags || [],
          } as GraphNode; // Assert type after mapping
        });
        loadedEdges = result.edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || '',
          type: e.type || 'soft',
        } as GraphEdge));
      } else if (!isElectron) {
        // Web version - keep existing API call
        const apiResult = await graphApi.getGraph(projectId);
        loadedNodes = apiResult.nodes;
        loadedEdges = apiResult.edges;
      } else {
        // Electron but API not available (should not happen if preload is correct)
        console.warn('[GraphStore] Electron environment but loadGraphData not found on electronAPI.');
        set({ isLoading: false, error: 'Graph loading not available in this Electron environment.' });
        return { nodes: [], edges: [] };
      }
      
      set({ nodes: loadedNodes, edges: loadedEdges, isLoading: false });
      return { nodes: loadedNodes, edges: loadedEdges };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to load graph:', errorMessage, error);
      set({ error: errorMessage, isLoading: false });
      // throw error; // Decide if the component should also handle this error
      return { nodes: [], edges: [] }; // Return empty on error to prevent crashes
    }
  },

  saveNodePosition: async (projectId: string, nodeId: string, position: { x: number; y: number }) => {
    const originalNodes = get().nodes;
    // Optimistically update UI
    set(state => ({
      nodes: state.nodes.map(n => n.id === nodeId ? { ...n, position } : n)
    }));

    try {
      if (isElectron && window.electronAPI?.updateNodeMetadata) {
        await window.electronAPI.updateNodeMetadata(nodeId, { position }); // nodeId is filePath in Electron
      } else if (!isElectron) {
        await graphApi.updateNodePosition(projectId, nodeId, position);
      } else {
        console.warn('[GraphStore] Electron environment but updateNodeMetadata not found on electronAPI.');
        throw new Error('Node position saving not available in this Electron environment.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to save node position:', errorMessage, error);
      set({ nodes: originalNodes, error: errorMessage }); // Revert on error
      // throw error;
    }
  },

  // Placeholder for createNode, updateNode, deleteNode, createEdge, deleteEdge
  // These will also need Electron-specific paths using IPC calls to main.ts
  // to modify files (create, update frontmatter, delete) or update a central link index.

  createNode: async (projectId: string, nodeData: Omit<GraphNode, 'id' | 'created' | 'modified'>): Promise<GraphNode | null> => {
    set({ isLoading: true, error: null });
    try {
      let newNode: GraphNode | null = null;
      if (isElectron && window.electronAPI?.createNodeFile) {
        // Prepare initial data for the main process. 
        // The main process `graph:createNodeFile` expects `label`, `type`, `position`, `tags`, `data`/`metadata`.
        // `nodeData` here is Omit<GraphNode, 'id' | 'created' | 'modified'>.
        // It might contain `label`, `title`, `type`, `position`, `data`, `metadata`, `tags`, `status` etc.
        
        // Ensure we pass a structure that main process expects for initialNodeData
        const initialMainNodeData: Partial<GraphNode> = {
          label: nodeData.label || nodeData.title, // Main uses label to derive title and filename
          title: nodeData.title || nodeData.label,
          type: nodeData.type,
          position: nodeData.position,
          tags: nodeData.tags,
          status: nodeData.status,
          // Pass `data` or `metadata` from nodeData if they exist.
          // The main process's `createNodeFile` merges `initialNodeData.data` and `initialNodeData.metadata`.
          data: nodeData.data, 
          metadata: nodeData.metadata, 
        };

        const createdNodeFromMain = await window.electronAPI.createNodeFile(initialMainNodeData);
        
        if (createdNodeFromMain) {
          // The object returned from main should already be compatible with GraphNode structure
          // as it mimics what graph:loadData produces per item.
          // We just need to ensure types align on frontend.
          newNode = {
            id: createdNodeFromMain.id,
            label: createdNodeFromMain.label,
            title: createdNodeFromMain.title,
            type: createdNodeFromMain.type,
            position: createdNodeFromMain.position,
            data: createdNodeFromMain.data, // This is the frontmatter from main
            metadata: createdNodeFromMain.data, // Map frontmatter to metadata for GraphNode
            status: createdNodeFromMain.status,
            created: createdNodeFromMain.created || new Date().toISOString(),
            modified: createdNodeFromMain.modified || new Date().toISOString(),
            tags: createdNodeFromMain.tags || [],
          } as GraphNode;
        }
      } else if (!isElectron) {
        // Construct the full node object as expected by graphApi.createNode for web
        const newNodePayload: GraphNode = {
          id: 'temp-' + Date.now(), // Web API typically assigns ID
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: nodeData.tags || [],
          status: nodeData.status || 'idea',
          metadata: nodeData.metadata || {},
          data: nodeData.data || {},
          ...nodeData, // Spread incoming data (label, title, type, position)
        };
        newNode = await graphApi.createNode(projectId, newNodePayload);
      } else {
        console.warn('[GraphStore] createNode: Electron API function createNodeFile not available.');
        throw new Error('Cannot create node: API not available.');
      }

      if (newNode) {
        set(state => ({ nodes: [...state.nodes, newNode!], isLoading: false }));
      } else {
        set({ isLoading: false, error: 'Failed to create node or no node data returned.' });
      }
      return newNode;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('createNode failed:', errorMessage, error);
      set({ isLoading: false, error: errorMessage });
      return null;
    }
  },
  updateNode: async (projectId: string, nodeId: string, updates: Partial<GraphNode>) => {
    const originalNodes = get().nodes;
    // Optimistic update for any changed properties
    set(state => ({
      nodes: state.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n),
    }));

    try {
      if (isElectron && window.electronAPI?.updateNodeMetadata) {
        // nodeId is filePath in Electron. Send only the 'updates' part to metadata.
        // If updates contain 'position', it will be handled. If other metadata fields, they'll be merged.
        await window.electronAPI.updateNodeMetadata(nodeId, updates);
      } else if (!isElectron) {
        const updatedNode = await graphApi.updateNode(projectId, nodeId, updates);
        // API might return the full updated node, ensure optimistic update is compatible
        // or refine based on API response.
        set(state => ({
          nodes: state.nodes.map(n => n.id === nodeId ? { ...n, ...updatedNode } : n),
        }));
      } else {
        throw new Error('Cannot update node: API not available.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to update node:', errorMessage, error);
      set({ nodes: originalNodes, error: errorMessage }); // Revert on error
    }
  },
  deleteNode: async (projectId: string, nodeId: string) => { console.warn('deleteNode not impl.'); return Promise.resolve(); },
 // Replace the existing createEdge action in your graphStore.ts with this:
 createEdge: async (projectId: string, edgeData: Omit<GraphEdge, 'id'>): Promise<GraphEdge | null> => {
  set({ isLoading: true, error: null });
  // Optimistically create an ID for the frontend
  const tempEdgeId = `edge-${edgeData.source}-${edgeData.target}-${Date.now()}`;
  const newEdgeOptimistic: GraphEdge = {
    ...edgeData,
    id: tempEdgeId,
    type: edgeData.type || 'soft', // Default to soft link
  };

  // Optimistic UI update
  set(state => ({
    edges: [...state.edges, newEdgeOptimistic],
    isLoading: false,
  }));

  try {
    if (isElectron && window.electronAPI?.updateNodeMetadata) {
      const sourceNode = get().nodes.find(n => n.id === edgeData.source);
      if (!sourceNode) {
        console.error(`[GraphStore] createEdge: Source node ${edgeData.source} not found for new edge.`);
        throw new Error(`Source node ${edgeData.source} not found.`);
      }

      // Ensure metadata and links array exist
      const currentMetadata = sourceNode.metadata || {};
      const existingLinks = Array.isArray(currentMetadata.links) ? currentMetadata.links : [];
      
      // Add target if not already present
      const newLinksArray = existingLinks.includes(edgeData.target) 
        ? existingLinks 
        : [...existingLinks, edgeData.target];

      await window.electronAPI.updateNodeMetadata(edgeData.source, { links: newLinksArray });
      
      // The edge is already optimistically added. For Electron, its ID is client-generated.
      // No further update to the edge itself is needed from main process for this op.
      return newEdgeOptimistic;

    } else if (!isElectron) {
      // Web version - API call
      const createdEdgeFromApi = await graphApi.createEdge(projectId, edgeData as GraphEdge); // API might assign ID
      if (createdEdgeFromApi) {
        // Update the optimistically added edge with the one from API (especially for ID)
        set(state => ({
          edges: state.edges.map(e => e.id === tempEdgeId ? createdEdgeFromApi : e),
        }));
        return createdEdgeFromApi;
      } else {
        throw new Error('Edge creation via API returned no data.');
      }
    } else {
      console.warn('[GraphStore] createEdge: API function not available.');
      throw new Error('Cannot create edge: API function not available.');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('createEdge action failed:', errorMessage, error);
    // Revert optimistic update
    set(state => ({
      edges: state.edges.filter(e => e.id !== tempEdgeId),
      error: errorMessage,
      isLoading: false,
    }));
    return null;
  }
},
  // Replace the existing deleteEdge action in your graphStore.ts with this:
  deleteEdge: async (projectId: string, edgeId: string) => {
    const originalEdges = get().edges;
    const edgeToDelete = originalEdges.find(e => e.id === edgeId);

    if (!edgeToDelete) {
      console.warn(`[GraphStore] deleteEdge: Edge with ID ${edgeId} not found.`);
      return; // Or throw an error
    }

    // Optimistic UI update
    set(state => ({
      edges: state.edges.filter(e => e.id !== edgeId),
      isLoading: false,
      error: null,
    }));

    try {
      if (isElectron && window.electronAPI?.updateNodeMetadata) {
        const sourceNode = get().nodes.find(n => n.id === edgeToDelete.source);
        if (!sourceNode) {
          console.error(`[GraphStore] deleteEdge: Source node ${edgeToDelete.source} not found for edge ${edgeId}.`);
          // Edge is already removed from UI, but log error as FS operation can't proceed
          // Potentially throw to indicate a more significant issue, or allow FS op to fail if sourceNode.metadata is checked
          return; // Or set error and keep edge removed from UI
        }

        const currentMetadata = sourceNode.metadata || {};
        const existingLinks = Array.isArray(currentMetadata.links) ? currentMetadata.links : [];
        
        const newLinksArray = existingLinks.filter(link => link !== edgeToDelete.target);

        // Only update if links actually changed (though updateNodeMetadata should be idempotent if no change)
        if (newLinksArray.length !== existingLinks.length) {
          await window.electronAPI.updateNodeMetadata(edgeToDelete.source, { links: newLinksArray });
        }
        // If the link wasn't in the frontmatter (e.g. a wikilink from content), this won't remove it from content.
        // That's a more advanced feature. This handles frontmatter-defined links.

      } else if (!isElectron) {
        // Web version
        await graphApi.deleteEdge(projectId, edgeId);
      } else {
        console.warn('[GraphStore] deleteEdge: API function not available.');
        throw new Error('Cannot delete edge: API function not available.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('deleteEdge action failed:', errorMessage, error);
      // Revert optimistic update
      set({ edges: originalEdges, error: errorMessage, isLoading: false });
    }
  },

})) 