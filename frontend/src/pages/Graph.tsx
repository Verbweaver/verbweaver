import { useCallback, useEffect, useState } from 'react'
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
import CustomNode from '../components/graph/CustomNode'
import NodeContextMenu from '../components/graph/NodeContextMenu'
import { NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'

// Define custom node types
const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function GraphView() {
  const { currentProject, currentProjectPath } = useProjectStore()
  const { nodes: verbweaverNodes, loadNodes, updateNode, createNode, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  
  // Connect WebSocket for real-time updates
  const projectId = currentProject?.id?.toString()
  useWebSocket(projectId)

  // Load and convert nodes when project changes or nodes update
  useEffect(() => {
    if (currentProject) {
      // Convert VerbweaverNodes to React Flow nodes and edges
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      
      verbweaverNodes.forEach((node) => {
        // Create flow node
        flowNodes.push({
          id: node.path,
          type: 'custom',
          position: node.metadata.position || { x: Math.random() * 500, y: Math.random() * 500 },
          data: {
            label: node.metadata.title,
            type: node.metadata.type,
            metadata: node.metadata,
            hasTask: node.hasTask,
            taskStatus: node.taskStatus,
            isDirectory: node.isDirectory,
            isMarkdown: node.isMarkdown,
          },
        })
        
        // Create hard link edges (parent-child)
        if (node.hardLinks.parent) {
          flowEdges.push({
            id: `hard-${node.hardLinks.parent}-${node.path}`,
            source: node.hardLinks.parent,
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
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      })
      setSelectedNode(node.id)
    },
    []
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
    },
    []
  )

  // Handle creating new node
  const handleCreateNode = useCallback(
    async (type: string, position?: { x: number; y: number }) => {
      const title = prompt(`Enter name for new ${type}:`)
      if (!title) return
      
      try {
        const parentPath = '' // Root level by default
        const newNode = await createNode(parentPath, title, type as any, {
          position: position || { x: 250, y: 250 }
        })
        
        // Node will be added to graph automatically via store update
        toast.success('Node created')
      } catch (error) {
        toast.error('Failed to create node')
      }
      
      setContextMenu(null)
    },
    [createNode]
  )

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
          onCreateNode={handleCreateNode}
          onDeleteNode={handleDeleteNode}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default GraphView 