import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  NodeTypes,
  MarkerType,
} from 'react-flow-renderer'
import { useProjectStore } from '../store/projectStore'
import { useNodeStore } from '../store/nodeStore'
import { useWebSocket } from '../services/websocket'
import { TemplateSelectionDialog } from '../components/TemplateSelectionDialog'
import { FolderCreateDialog } from '../components/FolderCreateDialog'
import { templatesApi, Template as ApiTemplate } from '../api/templates';
import { apiClient } from '../api/client'
import CustomNode from '../components/graph/CustomNode'
import NodeContextMenu from '../components/graph/NodeContextMenu'
import { NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { createNodeFromTemplateDesktop } from '../api/desktop-templates';

// Define custom node types
const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function GraphView() {
  const navigate = useNavigate()
  const { currentProject, currentProjectPath } = useProjectStore()
  const { nodes: verbweaverNodes, loadNodes, updateNode, createNode, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; isFolder?: boolean } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [pendingNodePosition, setPendingNodePosition] = useState<{ x: number; y: number } | undefined>()
  const [parentPathForNewNode, setParentPathForNewNode] = useState<string>('')
  
  // Connect WebSocket for real-time updates
  const projectId = currentProject?.id?.toString()
  useWebSocket(projectId)

  // Load nodes when component mounts or project changes
  useEffect(() => {
    if (currentProject) {
      loadNodes()
    }
  }, [currentProject, loadNodes])

  // Load and convert nodes when project changes or nodes update
  useEffect(() => {
    if (currentProject) {
      // Convert VerbweaverNodes to React Flow nodes and edges
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      
      // First, process all nodes from the store
      verbweaverNodes.forEach((node) => {
        // Create flow node for all nodes, including 'nodes' folder if it exists
        flowNodes.push({
          id: node.path,
          type: 'custom',
          position: node.metadata.position || { x: Math.random() * 500, y: Math.random() * 500 },
          data: {
            label: node.metadata.title || node.name,
            type: node.isDirectory ? 'folder' : (node.metadata.type || 'document'),
            metadata: node.metadata,
            hasTask: node.hasTask,
            taskStatus: node.taskStatus,
            isDirectory: node.isDirectory,
            isMarkdown: node.isMarkdown,
          },
        })
      })
      
      // Check if we need to add a virtual nodes folder
      // Only add if there's content in nodes/ AND we don't already have a 'nodes' node
      const hasNodesContent = Array.from(verbweaverNodes.keys()).some(path => path.startsWith('nodes/'))
      const hasNodesFolder = flowNodes.some(node => node.id === 'nodes')
      
      if (hasNodesContent && !hasNodesFolder) {
        // Add virtual root nodes folder
        flowNodes.push({
          id: 'nodes',
          type: 'custom',
          position: { x: 250, y: 50 },
          data: {
            label: 'nodes',
            type: 'folder',
            metadata: { title: 'nodes', type: 'folder' },
            hasTask: false,
            taskStatus: undefined,
            isDirectory: true,
            isMarkdown: false,
          },
        })
      }
      
      // Now create edges for all nodes
      verbweaverNodes.forEach((node) => {
        // Create hard link edges (parent-child)
        let parentPath = node.hardLinks.parent
        
        // Fix parent path for items directly in nodes folder
        if (node.path.startsWith('nodes/') && !node.path.substring(6).includes('/')) {
          parentPath = 'nodes'
        }
        
        if (parentPath) {
          flowEdges.push({
            id: `hard-${parentPath}-${node.path}`,
            source: parentPath,
            target: node.path,
            type: 'straight',
            style: { stroke: '#6b7280', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            label: 'contains',
          })
        }
        
        // Create soft link edges
        node.softLinks.forEach((targetId: string) => {
          // Find target node by ID
          const targetNode = Array.from(verbweaverNodes.values()).find(n => n.metadata.id === targetId)
          if (targetNode) {
            flowEdges.push({
              id: `soft-${node.path}-${targetNode.path}`,
              source: node.path,
              target: targetNode.path,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#3b82f6', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
              },
            })
          }
        })
      })
      
      setNodes(flowNodes)
      setEdges(flowEdges)
    }
  }, [currentProject, verbweaverNodes, setNodes, setEdges])

  // Handle node drag
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      updateNode(node.id, {
        metadata: { position: node.position }
      }).catch(() => {
        toast.error('Failed to save node position')
      })
    },
    [updateNode]
  )

  // Handle new connections
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      
      createSoftLink(params.source, params.target)
        .then(() => {
          setEdges((eds) => addEdge({
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          }, eds))
          toast.success('Link created')
        })
        .catch(() => {
          toast.error('Failed to create link')
        })
    },
    [createSoftLink, setEdges]
  )

  // Handle context menu
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      const verbweaverNode = verbweaverNodes.get(node.id)
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        isFolder: verbweaverNode?.isDirectory || false
      })
      setSelectedNode(node.id)
    },
    [verbweaverNodes]
  )

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect()
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      }
      
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
      })
      setPendingNodePosition(position)
    },
    []
  )

  // Handle creating new node
  const handleCreateNode = useCallback(
    async (type: string, position?: { x: number; y: number }) => {
      setPendingNodePosition(position)
      setParentPathForNewNode('')
      
      if (type === 'folder') {
        // For folders, open folder dialog
        setFolderDialogOpen(true)
      } else {
        // For nodes, open template selection dialog
        setTemplateDialogOpen(true)
      }
      
      setContextMenu(null)
    },
    []
  )

  // Handle folder creation
  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      if (!folderName) return
      
      try {
        if (isElectron && currentProjectPath && window.electronAPI) {
          // In Electron mode, create a folder by creating a hidden file inside it
          // This will automatically create the directory structure
          const dummyFilePath = `nodes/${folderName}/.gitkeep`
          const absolutePath = `${currentProjectPath}/${dummyFilePath}`.replace(/\/+/g, '/')
          await window.electronAPI.writeFile(absolutePath, '')
          await loadNodes()
          toast.success('Folder created')
        } else if (!isElectron && currentProject?.id) {
          // Web mode - use API
          const response = await apiClient.post(`/projects/${currentProject.id}/folders`, {
            parent_path: 'nodes',
            folder_name: folderName
          })
          
          if (response.status !== 200) throw new Error('Failed to create folder')
          
          await loadNodes()
          toast.success('Folder created')
        } else {
          toast.error('No project context available')
        }
      } catch (error) {
        console.error('Failed to create folder:', error)
        toast.error('Failed to create folder')
      }
    },
    [currentProject, currentProjectPath, loadNodes]
  )

  // Handle creating child node in folder
  const handleCreateChildNode = useCallback(
    async (parentPath: string) => {
      setParentPathForNewNode(parentPath)
      setTemplateDialogOpen(true)
      setContextMenu(null)
    },
    []
  )

  // Handle template selection
  const handleTemplateSelected = useCallback(
    async (templatePath: string, nodeName: string, parentPathValue: string) => {
      const targetParentPath = parentPathValue || parentPathForNewNode || 'nodes'; // Default to 'nodes' if no specific parent
      const metadataForNewNode = pendingNodePosition ? { position: pendingNodePosition } : {};
  
      try {
        let nodeResponseData; // To store the response from either API
  
        if (window.electronAPI && currentProjectPath) {
          // --- DESKTOP Path ---
          console.log('Using desktop API to create node from template', { 
            templatePath,          // e.g., "templates/Empty.md"
            nodeName,
            targetParentPath,      // e.g., "nodes" or "nodes/some_folder" (relative to project_root/nodes)
            metadataForNewNode 
          });
          nodeResponseData = await createNodeFromTemplateDesktop(
            templatePath,          // This is relative to project root for the IPC call
            nodeName,
            targetParentPath,      // This path is relative to the 'nodes' directory.
                                   // The IPC handler joins it with 'nodesDir'.
            metadataForNewNode
          );
        } else if (!window.electronAPI && currentProject?.id) {
          // --- WEB Path ---
          const projectId = currentProject.id; // Assuming ID is a string as expected by API
          console.log('Using web API to create node from template', { 
            projectId,
            templatePath, 
            nodeName, 
            targetParentPath, 
            metadataForNewNode 
          });
          
          nodeResponseData = await templatesApi.createNodeFromTemplate(projectId, {
            template_path: templatePath,       // Relative path to template, e.g., "templates/Empty.md"
            node_name: nodeName,
            parent_path: targetParentPath,     // Relative to 'nodes' dir, or 'nodes' for root of nodes
            initial_metadata: metadataForNewNode,
          });
        } else {
          // --- Context not available ---
          const errorMsg = 'Project context not available for creating node.';
          console.error(errorMsg, { 
            isElectron: !!window.electronAPI, 
            currentProjectPath, 
            currentProjectId: currentProject?.id 
          });
          toast.error(errorMsg);
          // Ensure dialog closes and states reset even if we return early
          setPendingNodePosition(undefined);
          setParentPathForNewNode('');
          setTemplateDialogOpen(false); // Close dialog
          return;
        }
        
        // --- Process response ---
        if (nodeResponseData) { 
          console.log('Node created successfully from template:', nodeResponseData);
          // Ensure nodeResponseData is used if needed to update the graph, 
          // or that loadNodes() correctly picks up the new node.
          await loadNodes(); // Reload graph nodes
          toast.success('Node created from template');
        } else {
          console.error('Node creation call succeeded but returned no data.');
          toast.error('Failed to create node: No data received.');
        }
  
      } catch (error: any) {
        console.error('Error creating node from template:', error);
        toast.error(`Error creating node: ${error.message || 'Unknown error'}`);
      } finally {
        setPendingNodePosition(undefined);
        setParentPathForNewNode('');
        setTemplateDialogOpen(false); // Ensure dialog is always closed
      }
    },
    [currentProject, currentProjectPath, loadNodes, pendingNodePosition, parentPathForNewNode, setTemplateDialogOpen] // Added currentProjectPath and setTemplateDialogOpen to dependency array
  );

  // Handle deleting node
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        await deleteNode(nodeId)
        // Nodes and edges will be removed automatically via store update
        toast.success('Node deleted')
      } catch (error) {
        toast.error('Failed to delete node')
      }
      
      setContextMenu(null)
    },
    [deleteNode]
  )

  // Handle editing node
  const handleEditNode = useCallback(
    (nodeId: string) => {
      // Navigate to editor with the file path
      navigate(`/editor/${encodeURIComponent(nodeId)}`)
      setContextMenu(null)
    },
    [navigate]
  )

  // Handle deleting edge
  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      // Parse edge ID to get source and target
      if (edgeId.startsWith('soft-')) {
        const parts = edgeId.split('-')
        if (parts.length >= 3) {
          const sourcePath = parts[1]
          const targetPath = parts[2]
          
          // Find target node to get its ID
          const targetNode = Array.from(verbweaverNodes.values()).find(n => n.path === targetPath)
          if (targetNode) {
            try {
              await removeSoftLink(sourcePath, targetNode.metadata.id)
              toast.success('Link removed')
            } catch (error) {
              toast.error('Failed to remove link')
            }
          }
        }
      }
    },
    [verbweaverNodes, removeSoftLink]
  )

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach(edge => {
        if (edge.id.startsWith('soft-')) {
          handleDeleteEdge(edge.id)
        }
      })
    },
    [handleDeleteEdge]
  )

  // Handle node click
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node.id)
    // TODO: Open node in editor
  }, [])

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Project Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a project to view the graph
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.type) {
              case NODE_TYPES.CHAPTER:
                return '#3b82f6'
              case NODE_TYPES.CHARACTER:
                return '#10b981'
              case NODE_TYPES.LOCATION:
                return '#f59e0b'
              case NODE_TYPES.TASK:
                return '#8b5cf6'
              case NODE_TYPES.DIRECTORY:
                return '#64748b'
              case NODE_TYPES.FILE:
                return '#94a3b8'
              case 'folder':
                return '#64748b'
              default:
                return '#6b7280'
            }
          }}
          style={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
          }}
        />
      </ReactFlow>
      
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          isFolder={contextMenu.isFolder}
          onCreateNode={handleCreateNode}
          onDeleteNode={handleDeleteNode}
          onEditNode={handleEditNode}
          onCreateChildNode={handleCreateChildNode}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      <FolderCreateDialog
        isOpen={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        onCreate={handleCreateFolder}
      />
      
      <TemplateSelectionDialog
        isOpen={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        onSelectTemplate={handleTemplateSelected}
        parentPath={parentPathForNewNode}
      />
    </div>
  )
}

export default GraphView 