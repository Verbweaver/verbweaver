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
import { useGraphStore } from '../store/graphStore'
import CustomNode from '../components/graph/CustomNode'
import NodeContextMenu from '../components/graph/NodeContextMenu'
import { GraphNode, GraphEdge, NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'

// Define custom node types
const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function GraphView() {
  const { currentProject, currentProjectPath } = useProjectStore()
  const { loadGraph, saveNodePosition, createNode, deleteNode, createEdge, deleteEdge } = useGraphStore()
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Load graph data when project changes
  useEffect(() => {
    if (currentProject) {
      if (isElectron && currentProjectPath) {
        // For Electron, create a sample graph structure
        const sampleNodes: Node[] = [
          {
            id: 'project-root',
            type: 'custom',
            position: { x: 250, y: 100 },
            data: {
              label: currentProject.name,
              type: NODE_TYPES.DIRECTORY,
              metadata: { title: currentProject.name, type: NODE_TYPES.DIRECTORY },
            },
          },
          {
            id: 'nodes-folder',
            type: 'custom',
            position: { x: 100, y: 250 },
            data: {
              label: 'Content Nodes',
              type: NODE_TYPES.DIRECTORY,
              metadata: { title: 'Content Nodes', type: NODE_TYPES.DIRECTORY },
            },
          },
          {
            id: 'tasks-folder',
            type: 'custom',
            position: { x: 400, y: 250 },
            data: {
              label: 'Tasks',
              type: NODE_TYPES.DIRECTORY,
              metadata: { title: 'Tasks', type: NODE_TYPES.DIRECTORY },
            },
          },
        ]

        const sampleEdges: Edge[] = [
          {
            id: 'project-to-nodes',
            source: 'project-root',
            target: 'nodes-folder',
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          {
            id: 'project-to-tasks',
            source: 'project-root',
            target: 'tasks-folder',
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          },
        ]

        setNodes(sampleNodes)
        setEdges(sampleEdges)
      } else {
        // For web version, load from API
        loadGraph(currentProject.id).then(({ nodes: graphNodes, edges: graphEdges }) => {
          // Convert GraphNode to React Flow Node
          const flowNodes = graphNodes.map((node: GraphNode) => ({
            id: node.id,
            type: 'custom',
            position: node.position || { x: Math.random() * 500, y: Math.random() * 500 },
            data: {
              label: node.title,
              type: node.type,
              metadata: node.metadata,
            },
          }))
          
          // Convert GraphEdge to React Flow Edge
          const flowEdges = graphEdges.map((edge: GraphEdge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type === 'hard' ? 'straight' : 'smoothstep',
            animated: edge.style?.animated,
            style: edge.style,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            label: edge.label,
          }))
          
          setNodes(flowNodes)
          setEdges(flowEdges)
        }).catch(() => {
          // If API fails, show empty graph
          setNodes([])
          setEdges([])
        })
      }
    }
  }, [currentProject, currentProjectPath, loadGraph, setNodes, setEdges])

  // Handle node drag
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (currentProject) {
        saveNodePosition(currentProject.id, node.id, node.position)
      }
    },
    [currentProject, saveNodePosition]
  )

  // Handle new connections
  const onConnect = useCallback(
    (params: Connection) => {
      if (!currentProject || !params.source || !params.target) return
      
      const newEdge: GraphEdge = {
        id: `${params.source}-${params.target}`,
        source: params.source,
        target: params.target,
        type: 'soft',
      }
      
      createEdge(currentProject.id, newEdge)
        .then(() => {
          setEdges((eds) => addEdge(params, eds))
          toast.success('Connection created')
        })
        .catch(() => {
          toast.error('Failed to create connection')
        })
    },
    [currentProject, createEdge, setEdges]
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
      if (!currentProject) return
      
      const newNode: GraphNode = {
        id: `node-${Date.now()}`,
        type: type as any,
        title: `New ${type}`,
        metadata: {
          id: `node-${Date.now()}`,
          title: `New ${type}`,
          type: type as any,
          created: new Date().toISOString(),
        },
        position: position || { x: 250, y: 250 },
      }
      
      try {
        if (isElectron && currentProjectPath) {
          // For Electron, just add the node locally
          const flowNode: Node = {
            id: newNode.id,
            type: 'custom',
            position: newNode.position!,
            data: {
              label: newNode.title,
              type: newNode.type,
              metadata: newNode.metadata,
            },
          }
          setNodes((nds) => [...nds, flowNode])
          toast.success('Node created locally')
        } else {
          // For web version, use the API
          await createNode(currentProject.id, newNode)
          const flowNode: Node = {
            id: newNode.id,
            type: 'custom',
            position: newNode.position!,
            data: {
              label: newNode.title,
              type: newNode.type,
              metadata: newNode.metadata,
            },
          }
          setNodes((nds) => [...nds, flowNode])
          toast.success('Node created')
        }
      } catch (error) {
        toast.error('Failed to create node')
      }
      
      setContextMenu(null)
    },
    [currentProject, currentProjectPath, createNode, setNodes]
  )

  // Handle deleting node
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!currentProject) return
      
      try {
        await deleteNode(currentProject.id, nodeId)
        setNodes((nds) => nds.filter((n) => n.id !== nodeId))
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
        toast.success('Node deleted')
      } catch (error) {
        toast.error('Failed to delete node')
      }
      
      setContextMenu(null)
    },
    [currentProject, deleteNode, setNodes, setEdges]
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