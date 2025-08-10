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
  ReactFlowProvider,
} from 'react-flow-renderer'
import { useProjectStore } from '../store/projectStore'
import { useNodeStore } from '../store/nodeStore'
import { useWebSocket } from '../services/websocket'
import { useTabStore } from '../store/tabStore'
import { TemplateSelectionDialog } from '../components/TemplateSelectionDialog'
import { FolderCreateDialog } from '../components/FolderCreateDialog'
import { templatesApi, Template as ApiTemplate } from '../api/templates';
import { apiClient } from '../api/client'
import CustomNode from '../components/graph/CustomNode'
import NodeContextMenu from '../components/graph/NodeContextMenu'
import { FileStorage, StoredFile } from '../utils/fileStorage'
import { Paperclip, Filter } from 'lucide-react'
import LayoutControls from '../components/graph/LayoutControls'
import ConfirmDialog from '../components/ConfirmDialog'
import { NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { createNodeFromTemplateDesktop } from '../api/desktop-templates';
import { getLayoutedElements, getExpandedLayout, LayoutDirection } from '../utils/graphLayout'

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
  const { addEditorTab } = useTabStore()
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string; isFolder?: boolean; hasTask?: boolean } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [pendingNodePosition, setPendingNodePosition] = useState<{ x: number; y: number } | undefined>()
  const [parentPathForNewNode, setParentPathForNewNode] = useState<string>('')
  const [confirmState, setConfirmState] = useState<{ open: boolean; nodeId?: string; nodeName?: string }>({ open: false })
  const [attachTarget, setAttachTarget] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [multiDeleteOpen, setMultiDeleteOpen] = useState(false)
  const [isShiftMarquee, setIsShiftMarquee] = useState(false)
  const [selectionBase, setSelectionBase] = useState<Set<string> | null>(null)
  const [ctrlMetaPressed, setCtrlMetaPressed] = useState(false)
  const [hideUploads, setHideUploads] = useState<boolean>(true)

  // Connect WebSocket for real-time updates
  const projectId = currentProject?.id?.toString()
  useWebSocket(projectId)

  // Load nodes when component mounts or project changes
  useEffect(() => {
    if (currentProject) {
      loadNodes()
    }
  }, [currentProject, loadNodes])

  // Track Ctrl/Cmd modifier globally for selection union/toggle semantics
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlMetaPressed(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlMetaPressed(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Keyboard: Delete selected nodes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
        e.preventDefault()
        if (selectedNodeIds.size === 1) {
          const only = Array.from(selectedNodeIds)[0]
          const isFolder = !!verbweaverNodes.get(only)?.isDirectory
          if (isFolder) {
            // Show bulk dialog for folder so contents are listed
            setMultiDeleteOpen(true)
          } else {
            const name = only.split('/').pop() || only
            setConfirmState({ open: true, nodeId: only, nodeName: name })
          }
        } else {
          setMultiDeleteOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds])

  // When an attach target is set, programmatically open the file picker
  useEffect(() => {
    if (attachTarget) {
      const openPicker = () => {
        const input = document.getElementById('graph-attach-input') as HTMLInputElement | null
        input?.click()
      }
      // Defer to ensure the input is in the DOM
      const id = setTimeout(openPicker, 0)
      return () => clearTimeout(id)
    }
  }, [attachTarget])

  // Load and convert nodes when project changes or nodes update
  useEffect(() => {
    if (currentProject) {
      // Convert VerbweaverNodes to React Flow nodes and edges
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      
      // First pass: Create all nodes (always exclude uploads/nodes/*; optionally hide all uploads/*)
      verbweaverNodes.forEach((node) => {
        const normPath = node.path.replace(/\\/g, '/');
        if (normPath.startsWith('uploads/nodes/')) {
          return; // always exclude uploads/nodes
        }
        if (hideUploads && normPath.startsWith('uploads/')) {
          return;
        }
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
      
      // Now create edges for all nodes that survived filtering
      const includedPaths = new Set(flowNodes.map(n => n.id))
      verbweaverNodes.forEach((node) => {
        const normPath = node.path.replace(/\\/g, '/')
        if (!includedPaths.has(node.path)) return
        // Create hard link edges (parent-child)
        let parentPath = node.hardLinks.parent
        
        // Fix parent path for items directly in nodes folder
        if (node.path.startsWith('nodes/') && !node.path.substring(6).includes('/')) {
          parentPath = 'nodes'
        }
        
        if (parentPath && includedPaths.has(parentPath) && includedPaths.has(node.path)) {
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
        
        // Create soft link edges (only create one edge per pair to avoid duplicates)
        node.softLinks.forEach((targetId: string) => {
          // Find target node by ID
          const targetNode = Array.from(verbweaverNodes.values()).find(n => n.metadata.id === targetId)
          if (targetNode && includedPaths.has(targetNode.path)) {
            // Only create edge if source ID is lexicographically smaller than target ID
            // This ensures we only create one edge per pair of linked nodes
            if (node.metadata.id < targetNode.metadata.id) {
              flowEdges.push({
                id: `soft_${node.metadata.id}_${targetNode.metadata.id}`,
                source: node.path,
                target: targetNode.path,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#3b82f6', strokeWidth: 2 },
                // Remove arrows since links are bidirectional
              })
            }
          }
        })
      })
      
      setNodes(flowNodes)
      setEdges(flowEdges)
    }
  }, [currentProject, verbweaverNodes, setNodes, setEdges, hideUploads])

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
            // Remove arrows since links are bidirectional
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
        isFolder: verbweaverNode?.isDirectory || false,
        hasTask: verbweaverNode?.hasTask || false,
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

  // Handle edge context menu
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      console.log('Edge context menu triggered:', edge.id)
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      })
    },
    []
  )

  // Handle unlinking edges
  const handleUnlinkEdge = useCallback(
    async (edgeId: string) => {
      console.log('handleUnlinkEdge called with:', edgeId)
      try {
        // Parse edge ID to get source and target node IDs
        if (edgeId.startsWith('soft_')) {
          const parts = edgeId.split('_', 3)
          if (parts.length === 3) {
            const sourceId = parts[1]
            const targetId = parts[2]
            
            // Find nodes by ID
            const sourceNode = Array.from(verbweaverNodes.values()).find(n => n.metadata.id === sourceId)
            const targetNode = Array.from(verbweaverNodes.values()).find(n => n.metadata.id === targetId)
            
            if (sourceNode && targetNode) {
              console.log('Removing link between:', sourceNode.path, 'and', targetNode.path)
              await removeSoftLink(sourceNode.path, targetNode.path)
              
              // Remove edge from visual graph
              setEdges((eds) => eds.filter(edge => edge.id !== edgeId))
              
              toast.success('Link removed')
            }
          }
        }
      } catch (error) {
        console.error('Failed to remove link:', error)
        toast.error('Failed to remove link')
      }
    },
    [removeSoftLink, setEdges, verbweaverNodes]
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
      const baseParent = parentPathForNewNode && parentPathForNewNode.length > 0 ? parentPathForNewNode : 'nodes'
      try {
        if (isElectron && currentProjectPath && window.electronAPI) {
          const dummyFilePath = `${baseParent}/${folderName}/.gitkeep`.replace(/\\/g, '/').replace(/\/\//g, '/')
          const absolutePath = `${currentProjectPath}/${dummyFilePath}`.replace(/\\/g, '/').replace(/\/\//g, '/')
          await window.electronAPI.writeFile(absolutePath, '')
          await loadNodes()
          toast.success('Folder created')
        } else if (!isElectron && currentProject?.id) {
          const response = await apiClient.post(`/projects/${currentProject.id}/folders`, {
            parent_path: baseParent,
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
      } finally {
        // Reset parent path after creation
        setParentPathForNewNode('')
      }
    },
    [currentProject, currentProjectPath, loadNodes, parentPathForNewNode]
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

  // Handle creating child folder in folder
  const handleCreateChildFolder = useCallback(
    async (parentPath: string) => {
      setParentPathForNewNode(parentPath)
      setFolderDialogOpen(true)
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
          
          // Convert template path to template name expected by API (strip prefix and extension)
          const templateName = templatePath
            .replace(/^templates\//, '')
            .replace(/\.md$/, '')
          
          nodeResponseData = await templatesApi.createNodeFromTemplate(projectId, {
            template_name: templateName,
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
  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeName = nodeId.split('/').pop() || nodeId
    setConfirmState({ open: true, nodeId, nodeName })
    setContextMenu(null)
  }, [])

  // Handle editing node
  const handleEditNode = useCallback(
    (nodeId: string) => {
      // Get the node to extract its name
      const node = verbweaverNodes.get(nodeId)
      const nodeName = node?.name || nodeId.split('/').pop() || 'Untitled'
      
      // Add editor tab and navigate
      addEditorTab(nodeId, nodeName)
      navigate(`/editor/${encodeURIComponent(nodeId)}`)
      setContextMenu(null)
    },
    [navigate, verbweaverNodes, addEditorTab]
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

  // Handle graph layout
  const handleLayout = useCallback((direction: LayoutDirection | 'expanded') => {
    let layoutedNodes: Node[]
    
    if (direction === 'expanded') {
      const result = getExpandedLayout(nodes, edges)
      layoutedNodes = result.nodes
    } else {
      const result = getLayoutedElements(nodes, edges, { direction })
      layoutedNodes = result.nodes
    }
    
    // Update node positions in the store
    Promise.all(
      layoutedNodes.map(node => 
        updateNode(node.id, { metadata: { position: node.position } })
      )
    ).then(() => {
      setNodes(layoutedNodes)
      toast.success('Layout applied')
    }).catch(() => {
      toast.error('Failed to save layout positions')
    })
  }, [nodes, edges, setNodes, updateNode])

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
    <div
      className="h-full w-full"
      onMouseDown={(e) => {
        if (e.shiftKey) {
          setIsShiftMarquee(true)
          setSelectionBase(new Set(selectedNodeIds))
        } else {
          setIsShiftMarquee(false)
          setSelectionBase(null)
        }
      }}
      onMouseUp={() => {
        setIsShiftMarquee(false)
        setSelectionBase(null)
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={(e) => {
          // If multiselect exists, opening pane menu should show multi menu as well
          onPaneContextMenu(e)
        }}
        onNodeClick={(event, node) => {
          // Let ReactFlow set selection; we'll adjust in onSelectionChange using modifiers
          setSelectedNode(node.id)
        }}
        onSelectionChange={(params) => {
          const clicked = new Set((params.nodes || []).map(n => n.id))
          if (isShiftMarquee && selectionBase) {
            const union = new Set(selectionBase)
            clicked.forEach(id => union.add(id))
            setSelectedNodeIds(union)
            setNodes(prev => prev.map(n => ({ ...n, selected: union.has(n.id) })))
            return
          }
          if (ctrlMetaPressed) {
            setSelectedNodeIds(prev => {
              const next = new Set(prev)
              if (clicked.size === 1) {
                const id = Array.from(clicked)[0]
                if (next.has(id)) next.delete(id); else next.add(id)
              } else {
                clicked.forEach(id => next.add(id))
              }
              setNodes(prevNodes => prevNodes.map(n => ({ ...n, selected: next.has(n.id) })))
              return next
            })
            return
          }
          // default replace behavior
          setSelectedNodeIds(clicked)
          setNodes(prev => prev.map(n => ({ ...n, selected: clicked.has(n.id) })))
        }}
        selectNodesOnDrag
        multiSelectionKeyCode={null as any}
        deleteKeyCode={null as any}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
      >
        <Background />
        <Controls />
        <LayoutControls onLayout={handleLayout} />
        {/* Toggle filter for uploads */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-background/80 border border-border rounded px-2 py-1 shadow">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideUploads}
              onChange={(e) => setHideUploads(e.target.checked)}
            />
            Hide uploads
          </label>
        </div>
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
          edgeId={contextMenu.edgeId}
          isFolder={contextMenu.isFolder}
          hasTask={contextMenu.hasTask}
          onCreateNode={handleCreateNode}
          onDeleteNode={(id) => {
            const isFolder = !!verbweaverNodes.get(id)?.isDirectory
            // If folder (even single), or multiple selected including this node, show multi-delete to list contents
            if (isFolder || (selectedNodeIds.size > 1 && selectedNodeIds.has(id))) {
              setMultiDeleteOpen(true)
            } else {
              handleDeleteNode(id)
            }
          }}
          onDeleteMultiple={() => setMultiDeleteOpen(true)}
          multiCount={selectedNodeIds.size > 1 ? selectedNodeIds.size : 0}
          onCreateChildFolder={handleCreateChildFolder}
          onEditNode={handleEditNode}
          onCreateChildNode={handleCreateChildNode}
          onSeeTask={(nodeId) => {
            setContextMenu(null);
            navigate(`/tasks/${encodeURIComponent(nodeId)}`);
          }}
          onUnlinkEdge={handleUnlinkEdge}
          onAttachFiles={(nodeId) => setAttachTarget(nodeId)}
          onUploadFiles={() => {
            const input = document.getElementById('graph-canvas-upload-input') as HTMLInputElement | null
            input?.click()
          }}
          onToggleTrackTask={async (nodeId) => {
            try {
              const store = useNodeStore.getState()
              let node = store.nodes.get(nodeId)
              if (!node) {
                try { await store.loadNodes() } catch {}
                node = useNodeStore.getState().nodes.get(nodeId)
              }
              if (!node || node.isDirectory) return
              const prevTracked = (node.metadata as any)?.task?.tracked !== false
              const nextTracked = !prevTracked
              const nextTask = { ...(node.metadata as any).task, tracked: nextTracked }
              await store.updateNode(nodeId, { metadata: { task: nextTask } as any })
              toast.success(nextTracked ? 'Tracking as Task' : 'Stopped tracking as Task')
            } finally {
              setContextMenu(null)
            }
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmState.open}
        title="Delete node"
        message={`Are you sure you want to delete "${confirmState.nodeName || ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (!confirmState.nodeId) return
          try {
            await deleteNode(confirmState.nodeId)
            await loadNodes()
          } finally {
            setConfirmState({ open: false })
          }
        }}
        onCancel={() => setConfirmState({ open: false })}
      />

      {/* Multi-delete confirmation */}
      <ConfirmDialog
        isOpen={multiDeleteOpen}
        title="Delete nodes"
        message={(() => {
          const paths = Array.from(selectedNodeIds)
          const folders = paths.filter(p => verbweaverNodes.get(p)?.isDirectory)
          const files = paths.filter(p => !verbweaverNodes.get(p)?.isDirectory)
          if (folders.length > 0 && files.length > 0) {
            return `You have selected both folders and files. Folders will not be deleted in a mixed selection. This will delete ${files.length} file(s).`
          }
          if (folders.length > 0) {
            return `You are about to delete ${folders.length} folder(s) and all of their contents. This action cannot be undone.`
          }
          return `Are you sure you want to delete these ${files.length} file(s)? This action cannot be undone.`
        })()}
        items={(() => {
          const paths = Array.from(selectedNodeIds)
          const folders = paths.filter(p => verbweaverNodes.get(p)?.isDirectory)
          const files = paths.filter(p => !verbweaverNodes.get(p)?.isDirectory)
          if (folders.length > 0 && files.length > 0) {
            // mixed: show only files
            return files.map(id => ({
              label: verbweaverNodes.get(id)?.metadata?.title || verbweaverNodes.get(id)?.name || id.split('/').pop() || id,
              subLabel: id,
            }))
          }
          if (folders.length > 0) {
            // folders only: expand contents listing (basic approximation using child hard links approximation from store paths)
            const items: { label: string; subLabel?: string }[] = []
            folders.forEach(folderPath => {
              items.push({ label: folderPath, subLabel: '(folder)' })
              // naive expansion: list immediate children in our node map by prefix
              Array.from(verbweaverNodes.keys())
                .filter(p => p.startsWith(folderPath + '/'))
                .forEach(p => items.push({ label: '  ' + (verbweaverNodes.get(p)?.metadata?.title || verbweaverNodes.get(p)?.name || p.split('/').pop() || p), subLabel: p }))
            })
            return items
          }
          // files only
          return files.map(id => ({
            label: verbweaverNodes.get(id)?.metadata?.title || verbweaverNodes.get(id)?.name || id.split('/').pop() || id,
            subLabel: id,
          }))
        })()}
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        onConfirm={async () => {
          try {
            const paths = Array.from(selectedNodeIds)
            const hasFolder = paths.some(p => verbweaverNodes.get(p)?.isDirectory)
            const hasFile = paths.some(p => !verbweaverNodes.get(p)?.isDirectory)
            if (hasFolder && hasFile) {
              // mixed: delete files only
              for (const id of paths) {
                if (!verbweaverNodes.get(id)?.isDirectory) {
                  await deleteNode(id)
                }
              }
            } else if (hasFolder) {
              // folders only
              for (const id of paths) {
                await deleteNode(id)
              }
            } else {
              // files only
              for (const id of paths) {
                await deleteNode(id)
              }
            }
            setSelectedNodeIds(new Set())
            await loadNodes()
          } finally {
            setMultiDeleteOpen(false)
          }
        }}
        onCancel={() => setMultiDeleteOpen(false)}
      />
      
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

      {/* Hidden file input for attachments */}
      {attachTarget && (
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          id="graph-attach-input"
          onChange={async (e) => {
            const files = e.target.files
            const targetPath = attachTarget
            setAttachTarget(null)
            if (!files || !targetPath) return
            try {
              const node = verbweaverNodes.get(targetPath)
              if (!node) return
              const existingFiles = ((node.metadata as any)?.task?.files) || []
              const uploaded: StoredFile[] = []
              for (const f of Array.from(files)) {
                const sf = await FileStorage.uploadFile(f, targetPath)
                if (sf) uploaded.push(sf)
              }
              const updatedTask = {
                ...(node.metadata.task || {}),
                files: [...existingFiles, ...uploaded],
              }
              await updateNode(targetPath, { metadata: { task: updatedTask } as any })
              toast.success('Files attached')
            } catch (err) {
              console.error('Attach files failed', err)
              toast.error('Failed to attach files')
            } finally {
              // reset the input value so same file can be uploaded again later
              const input = document.getElementById('graph-attach-input') as HTMLInputElement | null
              if (input) input.value = ''
            }
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      )}

      {/* Hidden input for canvas uploads from pane context menu */}
      <input
        type="file"
        multiple
        style={{ display: 'none' }}
        id="graph-canvas-upload-input"
        onChange={async (e) => {
          const files = e.target.files
          if (!files) return
          try {
            const uploaded: StoredFile[] = []
            for (const f of Array.from(files)) {
              const sf = await FileStorage.uploadFile(f, 'upload')
              if (sf) uploaded.push(sf)
            }
            const { currentProjectPath } = useProjectStore.getState()
            if (isElectron && window.electronAPI && currentProjectPath) {
              for (const sf of uploaded) {
                const rel = sf.path.replace(/\\/g,'/').startsWith(currentProjectPath.replace(/\\/g,'/') + '/')
                  ? sf.path.replace(/\\/g,'/').slice(currentProjectPath.replace(/\\/g,'/').length + 1)
                  : sf.path
                const absMeta = `${currentProjectPath}/${rel}.metadata.md`
                const meta = `---\nid: upload-${Date.now()}-${Math.random().toString(36).slice(2)}\ntitle: ${sf.originalName}\ntype: file\ntask:\n  tracked: false\n---\n`
                await window.electronAPI.writeFile(absMeta, meta)
              }
            }
            await loadNodes()
            toast.success('File(s) uploaded')
          } catch (err) {
            console.error('Upload failed', err)
            toast.error('Failed to upload files')
          } finally {
            const input = document.getElementById('graph-canvas-upload-input') as HTMLInputElement | null
            if (input) input.value = ''
          }
        }}
      />
    </div>
  )
}

export default function GraphViewWrapper() {
  return (
    <ReactFlowProvider>
      <GraphView />
    </ReactFlowProvider>
  )
} 