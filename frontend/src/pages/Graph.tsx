import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  useReactFlow,
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
import RemoveLinksModal from '../components/common/RemoveLinksModal'
import { FileStorage, StoredFile } from '../utils/fileStorage'
import { Paperclip, Filter, ListTree, Loader2, LineChart, Network } from 'lucide-react'
// @ts-ignore: type stub provided in global.d.ts; package installed at runtime
import * as htmlToImage from 'html-to-image'
import clsx from 'clsx'
import { STORAGE_KEYS } from '@verbweaver/shared'
import LayoutControls from '../components/graph/LayoutControls'
import { editorApi } from '../api/editorApi'
import { projectsApi } from '../api/projects'
import yaml from 'js-yaml'
import ConfirmDialog from '../components/ConfirmDialog'
import { NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { createNodeFromTemplateDesktop } from '../api/desktop-templates';
import ProgressionPanel from '../components/progression/ProgressionPanel'
// DnD for Outline
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { getLayoutedElements, getExpandedLayout, LayoutDirection } from '../utils/graphLayout'

// Define custom node types
const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function GraphView() {
  const navigate = useNavigate()
  const location = useLocation()
  const reactFlow = useReactFlow()
  const focusAppliedRef = useRef<string | null>(null)
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
  const [removeLinksOpen, setRemoveLinksOpen] = useState(false)
  const [removeLinksNodePath, setRemoveLinksNodePath] = useState<string | null>(null)
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)
  const [hideUploads, setHideUploads] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GRAPH_HIDE_UPLOADS)
      if (raw === null) return true
      return raw === 'true'
    } catch {
      return true
    }
  })
  const [rigidMode, setRigidMode] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GRAPH_RIGID_MODE)
      if (raw === null) return true
      return raw === 'true'
    } catch {
      return true
    }
  })
  // Hide completed tasks (Mind Map)
  const HIDE_COMPLETED_LOCAL_KEY = 'verbweaver_graph_hide_completed_tasks'
  const [hideCompletedTasks, setHideCompletedTasks] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(HIDE_COMPLETED_LOCAL_KEY)
      return raw === 'true'
    } catch {
      return false
    }
  })

  // Display one-way links (Mind Map)
  const SHOW_ONE_WAY_LOCAL_KEY = 'verbweaver_graph_show_one_way_links'
  const [showOneWayLinks, setShowOneWayLinks] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SHOW_ONE_WAY_LOCAL_KEY)
      if (raw === null) return true
      return raw === 'true'
    } catch {
      return true
    }
  })

  // Collapsible Options tray (Mind Map)
  const OPTIONS_OPEN_LOCAL_KEY = 'verbweaver_graph_options_open'
  const [optionsOpen, setOptionsOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(OPTIONS_OPEN_LOCAL_KEY)
      if (raw === null) return true
      return raw === 'true'
    } catch {
      return true
    }
  })

  // Task columns config (to determine completed status per project)
  const [taskColumns, setTaskColumns] = useState<any[]>([])
  const [completedColumnId, setCompletedColumnId] = useState<string | null>(null)
  const effectiveCompletedId = useMemo(() => {
    if (completedColumnId) return completedColumnId
    const byTitle = taskColumns.find((c: any) => /done|complete/i.test(c?.title))?.id
    if (byTitle) return byTitle
    const doneId = taskColumns.find((c: any) => c?.id === 'done')?.id
    return doneId || null
  }, [completedColumnId, taskColumns])
  const isTaskCompleted = useCallback((n: any): boolean => {
    const status = (n.taskStatus || n.metadata?.task?.status) as string | undefined
    if (effectiveCompletedId && status === effectiveCompletedId) return true
    if (n.metadata?.task?.completedDate) return true
    return false
  }, [effectiveCompletedId])

  // Counts for UI badges
  const uploadsHiddenCount = useMemo(() => {
    let count = 0
    verbweaverNodes.forEach((n) => {
      const normPath = n.path.replace(/\\/g, '/')
      const isUploadsRoot = normPath === 'uploads'
      const isUnderUploads = normPath.startsWith('uploads/')
      if (!(isUploadsRoot || isUnderUploads)) return
      if (normPath.startsWith('uploads/nodes/')) return
      count++
    })
    return count
  }, [verbweaverNodes])

  const completedHiddenCount = useMemo(() => {
    let count = 0
    verbweaverNodes.forEach((n) => {
      if (!n.isDirectory && n.hasTask && isTaskCompleted(n)) count++
    })
    return count
  }, [verbweaverNodes, isTaskCompleted])

  // Persisted per-project positions for folders (and optionally special nodes)
  const [graphPositions, setGraphPositions] = useState<Record<string, { x: number; y: number }>>({})
  // Persisted per-project collapsed state for folders
  const [graphCollapsed, setGraphCollapsed] = useState<Record<string, boolean>>({})
  // Flag to trigger initial rebuild after positions are loaded
  const [positionsReady, setPositionsReady] = useState<boolean>(false)

  // Outline subview state
  type GraphSubView = 'mindmap' | 'outline' | 'progression'
  const { getActiveTab, updateTab, updateTabMetadata } = useTabStore()
  const { activeTabId, tabs } = useTabStore((s) => ({ activeTabId: s.activeTabId, tabs: s.tabs }))
  const activeGraphTabId = useMemo(() => {
    const t = tabs.find(t => t.id === activeTabId)
    return t && t.type === 'graph' ? t.id : undefined
  }, [activeTabId, tabs])
  const [subView, setSubView] = useState<GraphSubView>(() => {
    try {
      const tab = useTabStore.getState().getActiveTab()
      const saved = (tab?.metadata as any)?.graphSubView as GraphSubView | undefined
      if (saved === 'outline' || saved === 'mindmap' || saved === 'progression') return saved
    } catch {}
    return 'mindmap'
  })
  const subViewLoadedRef = useRef(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['nodes']))
  const [outlineOrder, setOutlineOrder] = useState<Record<string, string[]>>({}) // parent -> ordered child ids
  const outlineFilePath = '.verbweaver/outline.yaml'

  const toggleExpand = (path: string) => setExpanded(prev => { const n = new Set(prev); n.has(path)? n.delete(path): n.add(path); return n })
  const expandCollapseAll = (expandAll: boolean) => {
    const parents = new Set<string>()
    verbweaverNodes.forEach(n => { if (n.hardLinks.parent) parents.add(n.hardLinks.parent) })
    setExpanded(expandAll ? parents : new Set())
  }

  // Load outline order (web: project settings; electron: local file if present)
  useEffect(() => {
    const loadOutline = async () => {
      if (!currentProject?.id) return
      try {
        if (!isElectron) {
          const settings = await projectsApi.getProjectSettings(currentProject.id)
          if (settings && typeof (settings as any).outlineMap === 'object') {
            setOutlineOrder((settings as any).outlineMap as Record<string, string[]>)
          }
          if (settings && typeof (settings as any).graphPositions === 'object') {
            setGraphPositions((settings as any).graphPositions as Record<string, { x: number; y: number }>)
          }
          if (settings && typeof (settings as any).graphCollapsed === 'object') {
            setGraphCollapsed((settings as any).graphCollapsed as Record<string, boolean>)
          }
          // Ensure positionsReady flips even if no positions exist
          setPositionsReady(true)
          return
        } else {
          // Electron: try local file if exists
          if (window.electronAPI && currentProjectPath) {
            const abs = `${currentProjectPath}/.verbweaver/outline.yaml`.replace(/\\/g, '/').replace(/\/\//g, '/')
            try {
              const content = await window.electronAPI.readFile(abs)
              const parsed: any = yaml.load(content || '') || {}
              if (parsed && typeof parsed === 'object') setOutlineOrder(parsed.outline || {})
              if (parsed && typeof parsed.graph_positions === 'object') setGraphPositions(parsed.graph_positions)
              if (parsed && typeof parsed.graph_collapsed === 'object') setGraphCollapsed(parsed.graph_collapsed)
              setPositionsReady(true)
            } catch {}
          }
        }
      } catch {}
      // If web and settings didn't contain outlineMap, still mark ready to avoid blocking
      setPositionsReady(true)
    }
    loadOutline()
  }, [currentProject?.id, currentProjectPath])

  // Load per-project Tasks settings (columns + completed column)
  useEffect(() => {
    const loadTasksSettings = async () => {
      if (!currentProject?.id) return
      try {
        const tasksSettings = await projectsApi.getTasksSettings(currentProject.id)
        if (Array.isArray(tasksSettings?.columns)) setTaskColumns(tasksSettings.columns)
        if (tasksSettings?.completedColumnId) setCompletedColumnId(tasksSettings.completedColumnId)
        else {
          const done = (tasksSettings?.columns || []).find((c: any) => /done|complete/i.test(c?.title))
          if (done) setCompletedColumnId(done.id)
        }
      } catch {
        // ignore: fall back to defaults via effectiveCompletedId
      }
    }
    loadTasksSettings()
  }, [currentProject?.id])

  // Initialize subview from active tab metadata
  useEffect(() => {
    const tab = getActiveTab()
    const saved = (tab?.metadata as any)?.graphSubView as GraphSubView | undefined
    if (saved === 'outline' || saved === 'mindmap' || saved === 'progression') setSubView(saved)
    subViewLoadedRef.current = true
  }, [getActiveTab])

  // Persist subview per tab (after initial load)
  useEffect(() => {
    if (!subViewLoadedRef.current) return
    const tab = getActiveTab()
    if (tab) {
      console.log('[Graph] Persisting subView to tab metadata', { tabId: tab.id, subView })
      updateTabMetadata(tab.id, (prev) => ({ ...(prev || {}), graphSubView: subView } as any))
    }
  }, [subView, getActiveTab, updateTab])

  // Update tab title based on active subview
  useEffect(() => {
    const tab = getActiveTab()
    if (!tab) return
    const title = subView === 'mindmap' ? 'Graph - Mind Map' : subView === 'outline' ? 'Graph - Outline' : 'Graph - Progression'
    console.log('[Graph] Updating tab title', { tabId: tab.id, title })
    updateTab(tab.id, { title })
  }, [subView, getActiveTab, updateTab])

  const saveOutline = async (map: Record<string, string[]>) => {
    if (!currentProject?.id) return
    // Web: store in project settings to avoid file API constraints
    if (!isElectron) {
      try {
        const settings = await projectsApi.getProjectSettings(currentProject.id)
        const next = { ...(settings || {}), outlineMap: map, graphPositions, graphCollapsed }
        await projectsApi.updateProjectSettings(currentProject.id, next)
      } catch (e) {
        console.warn('Failed to save outline in project settings', e)
      }
      return
    }
    // Electron: persist to file alongside project
    try {
      const content = yaml.dump({ outline: map, graph_positions: graphPositions, graph_collapsed: graphCollapsed })
      if (window.electronAPI && currentProjectPath) {
        const abs = `${currentProjectPath}/.verbweaver/outline.yaml`.replace(/\\/g, '/').replace(/\/\//g, '/')
        await window.electronAPI.writeFile(abs, content)
      } else if (currentProject?.id) {
        await editorApi.writeFile(currentProject.id, outlineFilePath, content)
      }
    } catch (e) {
      console.warn('Failed to save outline.yaml', e)
    }
  }

  // Persist graph positions and collapsed state to storage
  const persistGraphState = useCallback(async (folderPositions: Record<string, { x: number; y: number }>, collapsedMap: Record<string, boolean>) => {
    if (!currentProject?.id) return
    try {
      if (!isElectron) {
        const settings = await projectsApi.getProjectSettings(currentProject.id)
        const next = { ...(settings || {}), graphPositions: folderPositions, graphCollapsed: collapsedMap }
        await projectsApi.updateProjectSettings(currentProject.id, next)
      } else if (window.electronAPI && currentProjectPath) {
        const abs = `${currentProjectPath}/.verbweaver/outline.yaml`.replace(/\\/g, '/').replace(/\/\//g, '/')
        let parsed: any = {}
        try {
          const content = await window.electronAPI.readFile(abs)
          parsed = yaml.load(content || '') || {}
        } catch {}
        parsed.outline = parsed.outline || outlineOrder
        parsed.graph_positions = folderPositions
        parsed.graph_collapsed = collapsedMap
        const content = yaml.dump(parsed)
        await window.electronAPI.writeFile(abs, content)
      }
    } catch {}
  }, [currentProject?.id, currentProjectPath, outlineOrder])

  // Build virtual parent index for items moved to different folders
  const virtualParentOf = useMemo(() => {
    const res = new Map<string, string>()
    Object.entries(outlineOrder).forEach(([parent, children]) => {
      for (const id of children) res.set(id, parent)
    })
    return res
  }, [outlineOrder])

  const getRealParent = (path: string): string | null => {
    const n = verbweaverNodes.get(path)
    if (!n) return null
    let p = n.hardLinks.parent
    if (n.path.startsWith('nodes/') && !n.path.substring(6).includes('/')) p = 'nodes'
    return p || null
  }

  const getRealChildren = (parent: string): string[] => {
    const result: string[] = []
    verbweaverNodes.forEach(n => {
      let p = n.hardLinks.parent || null
      if (n.path.startsWith('nodes/') && !n.path.substring(6).includes('/')) p = 'nodes'
      const hide = n.path.replace(/\\/g,'/').startsWith('uploads/nodes/') || (hideUploads && n.path.replace(/\\/g,'/').startsWith('uploads/'))
      if (!hide && p === parent) result.push(n.path)
    })
    return result
  }

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
      // Check if user is typing in an input field, textarea, or contenteditable element
      const activeElement = document.activeElement
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      )
      
      // Don't process shortcuts if user is typing
      if (isTyping) {
        return
      }
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
        e.preventDefault()
        const hasNodes = selectedNodeIds.has('nodes')
        if (selectedNodeIds.size === 1) {
          const only = Array.from(selectedNodeIds)[0]
          if (only === 'nodes') {
            toast.error('The nodes folder is not deletable')
            return
          }
          const isFolder = !!verbweaverNodes.get(only)?.isDirectory
          if (isFolder) {
            setMultiDeleteOpen(true)
          } else {
            const name = only.split('/').pop() || only
            setConfirmState({ open: true, nodeId: only, nodeName: name })
          }
        } else {
          // Multi-delete: silently ignore nodes root by removing it from selection if present
          if (hasNodes) {
            setSelectedNodeIds(prev => {
              const next = new Set(prev)
              next.delete('nodes')
              return next
            })
          }
          setMultiDeleteOpen(true)
        }
      }
      // Toggle Hide Uploads (U)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'u') {
        setHideUploads(v => {
          const next = !v
          try { localStorage.setItem(STORAGE_KEYS.GRAPH_HIDE_UPLOADS, String(next)) } catch {}
          return next
        })
      }
      // Toggle Rigid Mode (A)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'a') {
        setRigidMode(v => {
          const next = !v
          try { localStorage.setItem(STORAGE_KEYS.GRAPH_RIGID_MODE, String(next)) } catch {}
          return next
        })
      }
      // Esc: clear selection and close menus
      if (e.key === 'Escape') {
        setSelectedNodeIds(new Set())
        setNodes(prev => prev.map(n => ({ ...n, selected: false })))
        setContextMenu(null)
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

  // Track theme changes to recalculate colors when needed
  const [themeVersion, setThemeVersion] = useState(0)
  
  useEffect(() => {
    // Listen for theme changes by monitoring CSS custom property changes
    const observer = new MutationObserver(() => {
      setThemeVersion(prev => prev + 1)
    })
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    
    return () => observer.disconnect()
  }, [])

  // Memoize theme colors, recalculate when theme changes
  const themeColors = useMemo(() => {
    const rootStyles = getComputedStyle(document.documentElement)
    const colorMutedFg = rootStyles.getPropertyValue('--muted-foreground').trim()
    const colorPrimary = rootStyles.getPropertyValue('--primary').trim()
    const colorBackground = rootStyles.getPropertyValue('--background').trim()
    const colorBorder = rootStyles.getPropertyValue('--border').trim()
    return {
      muted: colorMutedFg ? `hsl(${colorMutedFg})` : '#94a3b8',
      primary: colorPrimary ? `hsl(${colorPrimary})` : '#3b82f6',
      background: colorBackground ? `hsl(${colorBackground})` : '#0b0f19',
      border: colorBorder ? `hsl(${colorBorder})` : '#334155'
    }
  }, [themeVersion]) // Recalculate when theme changes

  // Load and convert nodes when project changes or nodes update
  useEffect(() => {
    if (currentProject && positionsReady) {
      // Convert VerbweaverNodes to React Flow nodes and edges
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      
      // First pass: Create all nodes we want on the graph
      // Build collapsed folder prefixes for quick filtering
      const collapsedFolders = new Set<string>(Object.entries(graphCollapsed).filter(([_, v]) => !!v).map(([k]) => k.replace(/\\/g, '/')))
      // Pre-compute how many descendants are hidden by each collapsed folder (excluding items hidden by other toggles)
      const collapsedHiddenCountByFolder = new Map<string, number>()
      const isEligibleWithoutCollapse = (node: any) => {
        const normPath = node.path.replace(/\\/g, '/')
        const isNodesRoot = normPath === 'nodes'
        const isUnderNodes = normPath.startsWith('nodes/')
        const isUploadsRoot = normPath === 'uploads'
        const isUnderUploads = normPath.startsWith('uploads/')
        if (normPath.startsWith('uploads/nodes/')) return false
        if (!(isNodesRoot || isUnderNodes || isUploadsRoot || isUnderUploads)) return false
        if (hideUploads && (isUploadsRoot || isUnderUploads)) return false
        if (hideCompletedTasks && !node.isDirectory && node.hasTask && isTaskCompleted(node)) return false
        return true
      }
      // Count descendants per collapsed folder among nodes that would otherwise be visible
      if (collapsedFolders.size > 0) {
        const collapsedArray = Array.from(collapsedFolders)
        verbweaverNodes.forEach((n) => {
          if (!isEligibleWithoutCollapse(n)) return
          const p = n.path.replace(/\\/g, '/')
          for (const cf of collapsedArray) {
            if (p !== cf && p.startsWith(cf + '/')) {
              collapsedHiddenCountByFolder.set(cf, (collapsedHiddenCountByFolder.get(cf) || 0) + 1)
            }
          }
        })
      }
      verbweaverNodes.forEach((node) => {
        const normPath = node.path.replace(/\\/g, '/')

        // Only include nodes/* and uploads/* (uploads optional), ignore everything else at root
        const isNodesRoot = normPath === 'nodes'
        const isUnderNodes = normPath.startsWith('nodes/')
        const isUploadsRoot = normPath === 'uploads'
        const isUnderUploads = normPath.startsWith('uploads/')

        // Always exclude uploads/nodes/*
        if (normPath.startsWith('uploads/nodes/')) return

        // Respect hide uploads toggle
        if (hideUploads && (isUploadsRoot || isUnderUploads)) return

        // Filter by allowed roots
        if (!(isNodesRoot || isUnderNodes || isUploadsRoot || isUnderUploads)) return

        // Hide descendants of collapsed folders (but still show the folder itself)
        const isDescendantOfCollapsed = Array.from(collapsedFolders).some(prefix => prefix !== normPath && (normPath.startsWith(prefix + '/')))
        if (isDescendantOfCollapsed) return

        // Hide completed Tasks (files only) when enabled
        if (hideCompletedTasks && !node.isDirectory && node.hasTask && isTaskCompleted(node)) return

        // Compute position
        const position = (() => {
          if (node.path === 'nodes') {
            const persisted = graphPositions['nodes']
            return persisted || { x: 0, y: 0 }
          }
          // Prefer persisted per-project positions for folders
          if (node.isDirectory) {
            const persisted = graphPositions[node.path]
            if (persisted && typeof persisted.x === 'number' && typeof persisted.y === 'number') return persisted
          }
          const saved = node.metadata.position
          if (rigidMode && saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            return saved
          }
          return saved || { x: Math.random() * 500, y: Math.random() * 500 }
        })()

        // Determine locked state: nodes root defaults to locked unless explicitly unlocked
        const isNodes = node.path === 'nodes'
        const locked = isNodes ? (node.metadata?.locked !== false) : !!node.metadata?.locked

        flowNodes.push({
          id: node.path,
          type: 'custom',
          position,
          data: {
            label: node.metadata.title || node.name,
            type: node.isDirectory ? 'folder' : (node.metadata.type || 'document'),
            metadata: node.metadata,
            hasTask: node.hasTask,
            taskStatus: node.taskStatus,
            isDirectory: node.isDirectory,
            isMarkdown: node.isMarkdown,
            locked,
            collapsed: !!graphCollapsed[node.path],
            hiddenCount: node.isDirectory && graphCollapsed[node.path] ? (collapsedHiddenCountByFolder.get(node.path) || 0) : undefined,
            isNodesRoot: isNodes,
            projectTitle: isNodes ? (currentProject?.name || 'Project') : undefined,
          },
          draggable: !locked,
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
          position: graphPositions['nodes'] || { x: 0, y: 0 },
          data: {
            label: 'nodes',
            type: 'folder',
            metadata: { title: 'nodes', type: 'folder' },
            hasTask: false,
            taskStatus: undefined,
            isDirectory: true,
            isMarkdown: false,
            locked: true,
            collapsed: !!graphCollapsed['nodes'],
            isNodesRoot: true,
            projectTitle: currentProject?.name || 'Project',
          },
          draggable: false,
        })
      }
      
      // Build a quick lookup of positions for handle direction calculations
      const positionOf = new Map<string, { x: number; y: number }>()
      flowNodes.forEach(n => positionOf.set(n.id, n.position))

      const chooseHandleIds = (sourcePos: { x: number; y: number }, targetPos: { x: number; y: number }) => {
        const dx = targetPos.x - sourcePos.x
        const dy = targetPos.y - sourcePos.y
        if (Math.abs(dy) >= Math.abs(dx)) {
          if (dy > 0) return { sourceHandle: 'bottom', targetHandle: 'top' }
          return { sourceHandle: 'top', targetHandle: 'bottom' }
        } else {
          if (dx > 0) return { sourceHandle: 'right', targetHandle: 'left' }
          return { sourceHandle: 'left', targetHandle: 'right' }
        }
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
          const s = positionOf.get(parentPath) || { x: 0, y: 0 }
          const t = positionOf.get(node.path) || { x: 0, y: 0 }
          const { sourceHandle, targetHandle } = chooseHandleIds(s, t)
          const outMap: Record<string,string> = { left: 'left-source', top: 'top-source', right: 'right-source', bottom: 'bottom-source' }
          const inMap: Record<string,string> = { left: 'left-target', top: 'top-target', right: 'right-target', bottom: 'bottom-target' }
          flowEdges.push({
            id: `hard-${parentPath}-${node.path}`,
            source: parentPath,
            target: node.path,
            type: 'straight',
            style: { stroke: themeColors.muted, strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            label: 'contains',
            sourceHandle: outMap[sourceHandle],
            targetHandle: inMap[targetHandle],
          })
        }
        
        // Create soft link edges
        node.softLinks.forEach((targetId: string) => {
          // Find target node by ID
          const targetNode = Array.from(verbweaverNodes.values()).find(n => n.metadata.id === targetId)
          if (!targetNode || !includedPaths.has(targetNode.path)) return
          const s = positionOf.get(node.path) || { x: 0, y: 0 }
          const t = positionOf.get(targetNode.path) || { x: 0, y: 0 }
          const { sourceHandle, targetHandle } = chooseHandleIds(s, t)
          const outMap: Record<string,string> = { left: 'left-source', top: 'top-source', right: 'right-source', bottom: 'bottom-source' }
          const inMap: Record<string,string> = { left: 'left-target', top: 'top-target', right: 'right-target', bottom: 'bottom-target' }

          const reciprocal = Array.isArray(targetNode.softLinks) && targetNode.softLinks.includes(node.metadata.id)
          if (reciprocal) {
            // Bidirectional: draw a single undirected animated soft link (avoid duplicates via lexicographic ordering)
            if (node.metadata.id < targetNode.metadata.id) {
              flowEdges.push({
                id: `soft_${node.metadata.id}_${targetNode.metadata.id}`,
                source: node.path,
                target: targetNode.path,
                type: 'smoothstep',
                animated: true,
                style: { stroke: themeColors.primary, strokeWidth: 2 },
                sourceHandle: outMap[sourceHandle],
                targetHandle: inMap[targetHandle],
              })
            }
          } else if (showOneWayLinks) {
            // One-way: draw a directional, visually distinct soft link with arrow and dashed stroke
            flowEdges.push({
              id: `soft_${node.metadata.id}_${targetNode.metadata.id}`,
              source: node.path,
              target: targetNode.path,
              type: 'smoothstep',
              animated: false,
              style: { stroke: themeColors.primary, strokeWidth: 2, strokeDasharray: '6 3' },
              markerEnd: { type: MarkerType.ArrowClosed },
              sourceHandle: outMap[sourceHandle],
              targetHandle: inMap[targetHandle],
            })
          }
        })
      })
      
      setNodes(flowNodes)
      setEdges(flowEdges)
    }
  }, [currentProject, positionsReady, verbweaverNodes, setNodes, setEdges, hideUploads, graphCollapsed, hideCompletedTasks, isTaskCompleted, showOneWayLinks])

  // Handle node drag
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      // Prevent drag persistence when locked
      if ((node.data as any)?.locked) return
      // Only persist when rigid mode is ON
      if (rigidMode) {
        updateNode(node.id, {
          metadata: { position: node.position }
        }).catch((err: any) => {
          // Surface details to help diagnose failures in Electron/web
          try {
            // eslint-disable-next-line no-console
            console.error('[Graph] Failed to save node position', { id: node.id, position: node.position, error: err })
          } catch {}
          toast.error('Failed to save node position')
        })
        // Persist per-project position for folders and nodes root
        const isFolder = (node.data as any)?.isDirectory || (node.data as any)?.type === 'folder' || node.id === 'nodes'
        if (isFolder) {
          setGraphPositions(prev => ({ ...prev, [node.id]: { x: node.position.x, y: node.position.y } }))
        }
      }
      // After moving, recompute edge handles to ensure closest-side attachments
      setEdges(prev => {
        const nodePositions = new Map(nodes.map(n => [n.id, n.id === node.id ? node.position : n.position]))
        const choose = (s: { x: number; y: number }, t: { x: number; y: number }) => {
          const dx = t.x - s.x; const dy = t.y - s.y
          if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' }
          return dx > 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' }
        }
        return prev.map(e => {
          const sp = nodePositions.get(e.source)
          const tp = nodePositions.get(e.target)
          if (sp && tp) {
            const { sourceHandle, targetHandle } = choose(sp, tp)
            const outMap: Record<string,string> = { left: 'left-source', top: 'top-source', right: 'right-source', bottom: 'bottom-source' }
            const inMap: Record<string,string> = { left: 'left-target', top: 'top-target', right: 'right-target', bottom: 'bottom-target' }
            return { ...e, sourceHandle: outMap[sourceHandle], targetHandle: inMap[targetHandle] }
          }
          return e
        })
      })
    },
    [updateNode, nodes, setEdges, rigidMode]
  )

  // Handle new connections
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) return
      try {
        await createSoftLink(params.source, params.target)
        // Force a refresh from source-of-truth to avoid duplicate temporary edge
        await loadNodes()
        toast.success('Link created')
      } catch {
        toast.error('Failed to create link')
      }
    },
    [createSoftLink, loadNodes]
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

  const exportMapAsPng = useCallback(async () => {
    // Track temporary UI changes so we can always restore them
    const toHide: HTMLElement[] = []
    const styled: Array<{ el: HTMLElement; prev: { color?: string; backgroundColor?: string; borderColor?: string; fill?: string; stroke?: string } }> = []
    try {
      const wrapper = reactFlowWrapperRef.current
      if (!wrapper) return
      const rf = wrapper.querySelector('.react-flow') as HTMLElement | null
      if (!rf) return

      // Hide overlays from capture
      wrapper.querySelectorAll('.react-flow__attribution, .react-flow__controls, .react-flow__minimap, .vw-overlay').forEach(el => {
        const e = el as HTMLElement
        if (e.style) { toHide.push(e); e.style.visibility = 'hidden' }
      })

      // Temporarily inline computed colors for edge label backgrounds/text so export matches UI
      // Background rects of edge labels (SVG <rect>), set fill/stroke explicitly
      rf.querySelectorAll('.react-flow__edge-textbg').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { backgroundColor: h.style.backgroundColor, borderColor: (h.style as any).borderColor, fill: (h.style as any).fill, stroke: (h.style as any).stroke }
        const fill = cs.fill || cs.backgroundColor
        const stroke = (cs as any).stroke || cs.borderColor
        if (fill) (h.style as any).fill = fill
        if (stroke) (h.style as any).stroke = stroke
        styled.push({ el: h, prev })
      })
      // Foreground text of edge labels (SVG <text> or HTML), set fill/color explicitly
      rf.querySelectorAll('.react-flow__edge-text').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { color: h.style.color, fill: (h.style as any).fill }
        const textFill = (cs as any).fill && (cs as any).fill !== 'none' ? (cs as any).fill : cs.color
        if (textFill) (h.style as any).fill = textFill
        // Also set color for HTML fallback
        h.style.color = textFill
        styled.push({ el: h, prev })
      })

      // Fit all nodes into view
      try {
        const all = nodes.map(n => n.id)
        if (all.length > 0) {
          // includeHiddenNodes in case some are filtered by UI; fit all nodes without unsafe casts
          reactFlow.fitView({ includeHiddenNodes: true, padding: 0.2 })
        }
      } catch (err) {
        // Log error to aid debugging; fitView failures are not fatal but should be visible
        console.error('Error fitting view in export image:', err);
      }

      const root = getComputedStyle(document.documentElement)
      const bgVar = root.getPropertyValue('--background').trim()
      const bgColor = bgVar ? `hsl(${bgVar})` : undefined
      const dataUrl = await htmlToImage.toPng(rf, {
        backgroundColor: bgColor,
        pixelRatio: window.devicePixelRatio || 1,
        filter: (el: Element) => {
          const cls = (el as HTMLElement).classList
          if (!cls) return true
          return !cls.contains('react-flow__attribution') && !cls.contains('react-flow__controls') && !cls.contains('react-flow__minimap') && !cls.contains('vw-overlay')
        },
      })

      const filename = `mindmap-${new Date().toISOString().replace(/[:.]/g,'-')}.png`
      if (isElectron && window.electronAPI?.saveBinaryFile) {
        const bin = await (await fetch(dataUrl)).arrayBuffer()
        const result = await window.electronAPI.saveBinaryFile(new Uint8Array(bin), filename)
        if (!result?.canceled) toast.success('Map saved')
      } else {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        toast.success('Download started')
      }
    } catch (e) {
      toast.error(`Failed to export mind map as PNG${e && (e as Error).message ? ': ' + (e as Error).message : ''}`)
    } finally {
      // Always restore UI state even if an error occurred mid-export
      try { toHide.forEach(e => { e.style.visibility = '' }) } catch {}
      try {
        styled.forEach(s => {
          if (s.prev.color !== undefined) s.el.style.color = s.prev.color
          if (s.prev.backgroundColor !== undefined) s.el.style.backgroundColor = s.prev.backgroundColor
          if ((s.prev as any).borderColor !== undefined) (s.el.style as any).borderColor = (s.prev as any).borderColor
          if ((s.prev as any).fill !== undefined) (s.el.style as any).fill = (s.prev as any).fill
          if ((s.prev as any).stroke !== undefined) (s.el.style as any).stroke = (s.prev as any).stroke
        })
      } catch {}
      setContextMenu(null)
    }
  }, [isElectron, nodes, reactFlow])

  // Global close for context menu on outside left-click
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (!contextMenu) return
      if (e.button !== 0) return // only left click
      const target = e.target as HTMLElement
      const insideMenu = target.closest('.vw-node-context-menu')
      if (!insideMenu) setContextMenu(null)
    }
    document.addEventListener('mousedown', handleGlobalMouseDown, true)
    return () => document.removeEventListener('mousedown', handleGlobalMouseDown, true)
  }, [contextMenu])

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
  
        if (templatePath === '__EMPTY__') {
          // Create raw empty file
          const rel = `${targetParentPath}/${nodeName.endsWith('.md') ? nodeName : nodeName + '.md'}`.replace(/\\/g,'/').replace(/\/\//g,'/')
          if (window.electronAPI && currentProjectPath) {
            const abs = `${currentProjectPath}/${rel}`.replace(/\\/g,'/').replace(/\/\//g,'/')
            await window.electronAPI.writeFile(abs, '')
            nodeResponseData = { path: rel }
          } else if (!window.electronAPI && currentProject?.id) {
            await editorApi.createFile(currentProject.id, rel, '', { raw: true, metadata: undefined })
            nodeResponseData = { path: rel }
          } else {
            throw new Error('Project context not available')
          }
        } else if (window.electronAPI && currentProjectPath) {
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
          toast.success(templatePath === '__EMPTY__' ? 'Empty file created' : 'Node created from template');
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
    if (nodeId === 'nodes') {
      toast.error('The nodes folder is not deletable')
      setContextMenu(null)
      return
    }
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

  const openRemoveLinksForNode = useCallback((nodePath: string) => {
    setRemoveLinksNodePath(nodePath)
    setRemoveLinksOpen(true)
    setContextMenu(null)
  }, [])

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
  // Choose edge handle IDs based on relative positions
  const chooseHandleIds = useCallback((sourcePos: { x: number; y: number }, targetPos: { x: number; y: number }) => {
    const dx = targetPos.x - sourcePos.x
    const dy = targetPos.y - sourcePos.y
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy > 0) return { sourceHandle: 'bottom', targetHandle: 'top' }
      return { sourceHandle: 'top', targetHandle: 'bottom' }
    } else {
      if (dx > 0) return { sourceHandle: 'right', targetHandle: 'left' }
      return { sourceHandle: 'left', targetHandle: 'right' }
    }
  }, [])

  const handleLayout = useCallback((direction: LayoutDirection | 'expanded') => {
    let layoutedNodes: Node[]
    
    if (direction === 'expanded') {
      const result = getExpandedLayout(nodes, edges)
      layoutedNodes = result.nodes
    } else {
      const result = getLayoutedElements(nodes, edges, { direction })
      layoutedNodes = result.nodes
    }
    
    // Keep 'nodes' anchored at origin if it exists and is locked
    layoutedNodes = layoutedNodes.map(n => {
      if (n.id === 'nodes') {
        const locked = (n.data as any)?.locked !== false
        return { ...n, position: locked ? { x: 0, y: 0 } : n.position }
      }
      return n
    })

    // Recompute edge handle directions based on positions
    const nodePos = new Map(layoutedNodes.map(n => [n.id, n.position]))
    const updatedEdges = edges.map(e => {
      const s = nodePos.get(e.source)
      const t = nodePos.get(e.target)
      if (s && t) {
        const { sourceHandle, targetHandle } = chooseHandleIds(s, t)
        const outMap: Record<string,string> = { left: 'left-source', top: 'top-source', right: 'right-source', bottom: 'bottom-source' }
        const inMap: Record<string,string> = { left: 'left-target', top: 'top-target', right: 'right-target', bottom: 'bottom-target' }
        return { ...e, sourceHandle: outMap[sourceHandle], targetHandle: inMap[targetHandle] }
      }
      return { ...e }
    })

    // Update node positions in the store, but never move locked nodes
    Promise.all(
      layoutedNodes.map(node => {
        const locked = (node.data as any)?.locked
        if (locked) return Promise.resolve()
        return updateNode(node.id, { metadata: { position: node.position } })
      })
    ).then(() => {
      setNodes(layoutedNodes)
      setEdges(updatedEdges)
      toast.success('Layout applied')
    }).catch(() => {
      toast.error('Failed to save layout positions')
    })
  }, [nodes, edges, setNodes, setEdges, updateNode, chooseHandleIds])

  // Persist positions when they change (dragging or layout applied)
  useEffect(() => {
    if (!currentProject?.id) return
    // Build a map of folder positions plus special 'nodes'
    const folderPositions: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => {
      const isFolder = (n.data as any)?.isDirectory || (n.data as any)?.type === 'folder' || n.id === 'nodes'
      if (isFolder && n.position) folderPositions[n.id] = { x: n.position.x, y: n.position.y }
    })
    setGraphPositions(folderPositions)
    // Save merged into project settings or outline.yaml without blocking UI
    ;(async () => {
      try {
        if (rigidMode) await persistGraphState(folderPositions, graphCollapsed)
      } catch {}
    })()
  }, [nodes, currentProject?.id, rigidMode, graphCollapsed, persistGraphState])

  // Toggle collapsed state for a folder and persist immediately
  const toggleFolderCollapsed = useCallback(async (folderPath: string) => {
    setGraphCollapsed(prev => {
      const next = { ...prev, [folderPath]: !prev[folderPath] }
      // Persist asynchronously but do not block UI
      ;(async () => {
        try {
          await persistGraphState(graphPositions, next)
        } catch {}
      })()
      return next
    })
  }, [graphPositions, persistGraphState])

  // -------- Outline helpers --------
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | 'into' | null>(null)
  const [previewSort, setPreviewSort] = useState<'none' | 'alphabetical' | 'reverse-alphabetical' | 'random' | 'relationship-group'>('none')
  const previewActive = previewSort !== 'none'

  const getChildren = (parent: string): string[] => {
    // Merge real children with any virtual overrides in outlineOrder
    const childrenSet = new Set<string>()
    // Real children, excluding those rerouted to another virtual parent
    for (const id of getRealChildren(parent)) {
      const vp = virtualParentOf.get(id)
      if (vp && vp !== parent) continue
      childrenSet.add(id)
    }
    // Virtual mapping may place items under a different parent
    const manual = outlineOrder[parent]
    if (manual) {
      for (const id of manual) childrenSet.add(id)
    }
    let children = Array.from(childrenSet)
    if (manual && manual.length > 0) {
      const setManual = new Set(manual)
      const ordered = manual.filter(id => children.includes(id))
      const rest = children.filter(id => !setManual.has(id)).sort()
      children = [...ordered, ...rest]
    } else {
      children = children.sort()
    }
    // Apply preview sort override
    switch (previewSort) {
      case 'alphabetical':
        return children.sort((a, b) => {
          const ta = verbweaverNodes.get(a)?.metadata?.title || verbweaverNodes.get(a)?.name || a
          const tb = verbweaverNodes.get(b)?.metadata?.title || verbweaverNodes.get(b)?.name || b
          return ta.localeCompare(tb)
        })
      case 'reverse-alphabetical':
        return children.sort((a, b) => {
          const ta = verbweaverNodes.get(a)?.metadata?.title || verbweaverNodes.get(a)?.name || a
          const tb = verbweaverNodes.get(b)?.metadata?.title || verbweaverNodes.get(b)?.name || b
          return tb.localeCompare(ta)
        })
      case 'random':
        return [...children].sort(() => Math.random() - 0.5)
      case 'relationship-group': {
        const index = new Map(children.map((id, i) => [id, i]))
        const visited = new Set<string>()
        const result: string[] = []
        const getNeighbors = (id: string) => {
          const node = verbweaverNodes.get(id)
          if (!node) return [] as string[]
          const set = new Set(node.softLinks
            .map(targetId => Array.from(verbweaverNodes.values()).find(n => n.metadata?.id === targetId)?.path)
            .filter((p): p is string => !!p && index.has(p)))
          return Array.from(set)
        }
        for (const id of children) {
          if (visited.has(id)) continue
          const queue = [id]
          const component: string[] = []
          visited.add(id)
          while (queue.length) {
            const cur = queue.shift() as string
            component.push(cur)
            for (const nb of getNeighbors(cur)) {
              if (!visited.has(nb)) { visited.add(nb); queue.push(nb) }
            }
          }
          component.sort((a, b) => {
            const ta = verbweaverNodes.get(a)?.metadata?.title || verbweaverNodes.get(a)?.name || a
            const tb = verbweaverNodes.get(b)?.metadata?.title || verbweaverNodes.get(b)?.name || b
            return ta.localeCompare(tb)
          })
          result.push(...component)
        }
        return result
      }
      default:
        return children
    }
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const renderOutlineTree = (parent: string, depth: number): JSX.Element => {
    const children = getChildren(parent)
    if (children.length === 0) return (<div key={parent}></div>)
    return (
      <div key={`block-${parent}`} className="space-y-1">
        {children.map((id) => {
          const n = verbweaverNodes.get(id)
          if (!n) return null
          const indent = { paddingLeft: `${depth * 20}px` }
          const isFolder = !!n.isDirectory
          const expandedHere = expanded.has(id)
          return (
            <div key={id}>
              {/* Insertion line (before) */}
              {dragOverId === id && dragOverPos === 'before' && (
                <div
                  className="h-0.5 bg-primary/70 rounded transition-all"
                  style={{ marginLeft: `${depth * 20}px` }}
                />
              )}
              <div
                className={clsx(
                  "flex items-center gap-2 py-1 px-2 rounded w-full select-none",
                  draggingId === id ? "opacity-70" : "hover:bg-accent/30",
                  dragOverId === id && dragOverPos !== 'into' ? "ring-2 ring-primary/50" : ""
                )}
                style={indent}
                onMouseDown={(e)=>{
                  if (rigidMode) return
                  setDraggingId(id)
                  setDragOverId(id)
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
                  setDragOverPos(pos)
                }}
                onMouseMove={(e)=>{
                  if (!draggingId) return
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
                  setDragOverId(id); setDragOverPos(pos)
                }}
                onMouseLeave={()=>{ if (!draggingId) return; setDragOverId(null); setDragOverPos(null) }}
                onMouseUp={async ()=>{
                  if (!draggingId || rigidMode) return
                  const sourceId = draggingId
                  const targetId = id
                  const pos = dragOverPos || 'after'
                  setDraggingId(null); setDragOverId(null); setDragOverPos(null)
                  if (!sourceId || !targetId || sourceId === targetId) return
                  const sourceParent = virtualParentOf.get(sourceId) ?? getRealParent(sourceId)
                  const targetParent = getRealParent(targetId)
                  if (!sourceParent || !targetParent) return
                  if (pos === 'into') return // handled by folder container below
                  if (sourceParent === targetParent) {
                    const current = getChildren(sourceParent)
                    const next = current.filter(x => x !== sourceId)
                    const tIdx = next.indexOf(targetId)
                    const insertAt = Math.max(0, tIdx + (pos === 'after' ? 1 : 0))
                    next.splice(insertAt, 0, sourceId)
                    const newMap = { ...outlineOrder, [sourceParent]: next }
                    setOutlineOrder(newMap)
                    await saveOutline(newMap)
                  } else {
                    const srcList = getChildren(sourceParent).filter(x => x !== sourceId)
                    const tgtList = getChildren(targetParent)
                    const tIdx = tgtList.indexOf(targetId)
                    const insertAt = Math.max(0, tIdx + (pos === 'after' ? 1 : 0))
                    const newTgt = [...tgtList]
                    newTgt.splice(insertAt, 0, sourceId)
                    const newMap = { ...outlineOrder, [sourceParent]: srcList, [targetParent]: newTgt }
                    setOutlineOrder(newMap)
                    await saveOutline(newMap)
                    setExpanded(prev => new Set([...Array.from(prev), targetParent]))
                  }
                }}
              >
                {isFolder ? (
                  <button className="text-xs px-1 select-none" onClick={()=>toggleExpand(id)}>{expandedHere ? '▾' : '▸'}</button>
                ) : (
                  <span className="text-xs px-1 opacity-0">•</span>
                )}
                <span className="text-sm font-medium truncate flex-1 text-foreground" title={n.metadata?.title || n.name}>{n.metadata?.title || n.name}</span>
                <div className="ml-2 flex items-center gap-2">
                  {/* Row actions */}
                  {n.hasTask && (
                    <button className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent" onClick={()=>navigate(`/tasks/${encodeURIComponent(n.path)}`)}>See Task</button>
                  )}
                  <button className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent" onClick={()=>{ addEditorTab(n.path, n.name); navigate(`/editor/${encodeURIComponent(n.path)}`) }}>Edit</button>
                  <button className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent" onClick={async()=>{
                    try {
                      const prevTracked = (n.metadata as any)?.task?.tracked !== false
                      const nextTracked = !prevTracked
                      const nextTask = { ...(n.metadata as any).task, tracked: nextTracked }
                      await useNodeStore.getState().updateNode(n.path, { metadata: { task: nextTask } as any })
                      toast.success(nextTracked ? 'Tracking as Task' : 'Stopped tracking as Task')
                    } catch { toast.error('Failed to toggle task tracking') }
                  }}>{(n.metadata as any)?.task?.tracked !== false ? 'Untrack as Task' : 'Track as Task'}</button>
                </div>
              </div>
              {isFolder && expandedHere && (
                <div
                  className={clsx(
                    "ml-[20px] border-l border-dashed border-border pl-2",
                    dragOverId === id && dragOverPos === 'into' ? "bg-accent/20" : ""
                  )}
                  onMouseMove={()=>{ if (!draggingId) return; setDragOverId(id); setDragOverPos('into') }}
                  onMouseLeave={()=>{ if (!draggingId) return; setDragOverId(null); setDragOverPos(null) }}
                  onMouseUp={async ()=>{
                    if (!draggingId || rigidMode) return
                    const sourceId = draggingId
                    setDraggingId(null); setDragOverId(null); setDragOverPos(null)
                    if (sourceId === id) return
                    const sourceParent = virtualParentOf.get(sourceId) ?? getRealParent(sourceId)
                    if (!sourceParent) return
                    const destParent = id
                    const srcList = getChildren(sourceParent).filter(x => x !== sourceId)
                    const destList = getChildren(destParent)
                    const newDest = [...destList, sourceId]
                    const newMap = { ...outlineOrder, [sourceParent]: srcList, [destParent]: newDest }
                    setOutlineOrder(newMap)
                    await saveOutline(newMap)
                    setExpanded(prev => new Set([...Array.from(prev), destParent]))
                  }}
                >
                  {renderOutlineTree(id, depth + 1)}
                </div>
              )}
              {/* Insertion line (after) */}
              {dragOverId === id && dragOverPos === 'after' && (
                <div
                  className="h-0.5 bg-primary/70 rounded transition-all"
                  style={{ marginLeft: `${depth * 20}px` }}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const generateOutlineMarkdown = (): string => {
    const lines: string[] = []
    const walk = (parent: string, depth: number) => {
      const children = getChildren(parent)
      for (const id of children) {
        const n = verbweaverNodes.get(id)
        if (!n) continue
        const title = n.metadata?.title || n.name
        lines.push(`${'  '.repeat(depth)}- ${title}`)
        if (n.isDirectory) walk(id, depth + 1)
      }
    }
    walk('nodes', 0)
    return lines.join('\n')
  }

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

  if (!positionsReady) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading graph positions…</span>
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
      {/* Right-side panel (Mind Map/Outline switch + per-view controls) is rendered per subview below */}

      {subView === 'mindmap' && (
      <div ref={reactFlowWrapperRef} className="h-full w-full">
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
        className="bg-background relative z-10"
      >
        {/* Auto-focus target node if focus query param is present */}
        {(() => {
          const params = new URLSearchParams(location.search)
          const targetPath = params.get('focus')
          if (targetPath && focusAppliedRef.current !== targetPath) {
            const target = nodes.find(n => n.id === targetPath)
            if (target) {
              focusAppliedRef.current = targetPath
              setSelectedNodeIds(new Set([targetPath]))
              setNodes(prev => prev.map(n => ({ ...n, selected: n.id === targetPath })))
              const { x, y } = target.position || { x: 0, y: 0 }
              try { reactFlow.setCenter(x, y, { zoom: 1.5, duration: 600 }) } catch {}
            }
          }
          return null
        })()}
        <Background />
        <Controls />
        {/* Mind Map right-side panel */}
        <div className="absolute top-2 right-2 z-30 pointer-events-auto vw-overlay">
          <div className="bg-background/80 border border-border rounded p-2 shadow flex flex-col gap-2 items-stretch w-56">
            <button className={'px-2 py-1 bg-accent rounded text-sm'} onClick={()=>setSubView('mindmap')}><span className="inline-flex items-center gap-1"><Network className="w-4 h-4"/>Mind Map</span></button>
            <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('outline')} title="Outline"><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
            <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('progression')} title="Progression"><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
            <div className="pt-1 border-t border-border" />
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Layout</label>
              <LayoutControls onLayout={handleLayout} mode="inline" />
            </div>
          </div>
        </div>
        {/* Left controls: collapsible Options tray */}
        <div className="absolute top-2 left-2 z-10 pointer-events-auto vw-overlay">
          <div className="bg-background/80 border border-border rounded shadow w-64">
            <button
              className="w-full flex items-center justify-between px-2 py-1 text-sm"
              onClick={() => setOptionsOpen(o => { const next = !o; try { localStorage.setItem(OPTIONS_OPEN_LOCAL_KEY, String(next)) } catch {}; return next })}
              aria-expanded={optionsOpen}
            >
              <span>Options</span>
              <span className="text-xs">{optionsOpen ? '▾' : '▸'}</span>
            </button>
            {optionsOpen && (
              <div className="p-2 flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-sm" title="Hide files inside the uploads/ directory from the Mind Map.">
                  <input
                    type="checkbox"
                    checked={hideUploads}
                    onChange={(e) => {
                      const v = e.target.checked
                      setHideUploads(v)
                      try { localStorage.setItem(STORAGE_KEYS.GRAPH_HIDE_UPLOADS, String(v)) } catch {}
                    }}
                  />
                  <span className="inline-flex items-center gap-1">
                    <span>Hide uploads</span>
                    {hideUploads && uploadsHiddenCount > 0 && (
                      <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground" title={`${uploadsHiddenCount} items hidden`}>
                        {uploadsHiddenCount}
                      </span>
                    )}
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm" title="When enabled: completed Tasks are hidden from the Mind Map.">
                  <input
                    type="checkbox"
                    checked={hideCompletedTasks}
                    onChange={(e) => {
                      const v = e.target.checked
                      setHideCompletedTasks(v)
                      try { localStorage.setItem(HIDE_COMPLETED_LOCAL_KEY, String(v)) } catch {}
                    }}
                  />
                  <span className="inline-flex items-center gap-1">
                    <span>Hide completed Tasks</span>
                    {hideCompletedTasks && completedHiddenCount > 0 && (
                      <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground" title={`${completedHiddenCount} tasks hidden`}>
                        {completedHiddenCount}
                      </span>
                    )}
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm" title="Show directional edges for one-way links.">
                  <input
                    type="checkbox"
                    checked={showOneWayLinks}
                    onChange={(e) => {
                      const v = e.target.checked
                      setShowOneWayLinks(v)
                      try { localStorage.setItem('verbweaver_graph_show_one_way_links', String(v)) } catch {}
                    }}
                  />
                  Display one-way links
                </label>
                <label className="inline-flex items-center gap-2 text-sm" title="When enabled: dragging updates and saves positions (folders saved per project). When disabled: dragging is temporary and not saved.">
                  <input
                    type="checkbox"
                    checked={rigidMode}
                    onChange={(e) => {
                      const v = e.target.checked
                      setRigidMode(v)
                      try { localStorage.setItem(STORAGE_KEYS.GRAPH_RIGID_MODE, String(v)) } catch {}
                    }}
                  />
                  Rigid mode
                </label>
              </div>
            )}
          </div>
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
      </div>
      )}

      {subView === 'outline' && (
        <div className="h-full w-full overflow-auto p-3 text-foreground relative z-0">
          {/* Outline right-side panel */}
          <div className="absolute top-2 right-2 z-30 pointer-events-auto">
            <div className="bg-background/80 border border-border rounded p-2 shadow flex flex-col gap-2 items-stretch w-56">
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('mindmap')}><span className="inline-flex items-center gap-1"><Network className="w-4 h-4"/>Mind Map</span></button>
              <button className={'px-2 py-1 bg-accent rounded text-sm'} onClick={()=>setSubView('outline')} disabled><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('progression')}><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
              <div className="pt-1 border-t border-border" />
              <label className="inline-flex items-center gap-2 text-xs" title="Hide files inside the uploads/ directory from the Outline.">
                <input
                  type="checkbox"
                  checked={hideUploads}
                  onChange={(e)=>{
                    const v = e.target.checked
                    setHideUploads(v)
                    try { localStorage.setItem(STORAGE_KEYS.GRAPH_HIDE_UPLOADS, String(v)) } catch {}
                  }}
                />
                Hide uploads
              </label>
              <label className="inline-flex items-center gap-2 text-xs" title="When enabled: dragging updates and saves positions (folders saved per project). When disabled: dragging is temporary and not saved.">
                <input
                  type="checkbox"
                  checked={rigidMode}
                  onChange={(e)=>{
                    const v = e.target.checked
                    setRigidMode(v)
                    try { localStorage.setItem(STORAGE_KEYS.GRAPH_RIGID_MODE, String(v)) } catch {}
                  }}
                />
                Rigid mode
              </label>
              <div className="pt-1 border-t border-border" />
              <label className="text-xs font-medium">Sort</label>
              <select
                className="text-xs border border-border rounded px-1 py-1 bg-background"
                value={previewSort}
                onChange={(e)=> setPreviewSort(e.target.value as any)}
              >
                <option value="none">Manual / Natural</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="reverse-alphabetical">Reverse Alphabetical</option>
                <option value="random">Random</option>
                <option value="relationship-group">Virtual Group: Relationships</option>
              </select>
              {previewSort !== 'none' && (
                <div className="flex gap-2">
                  <button className="flex-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent" onClick={async ()=>{
                    const applyForParent = (parent: string, acc: Record<string,string[]>) => {
                      const ordered = getChildren(parent)
                      if (ordered.length) acc[parent] = ordered
                      const realKids = getRealChildren(parent)
                      realKids.forEach(child => {
                        if (verbweaverNodes.get(child)?.isDirectory) applyForParent(child, acc)
                      })
                    }
                    const newMap: Record<string,string[]> = { ...outlineOrder }
                    applyForParent('nodes', newMap)
                    setOutlineOrder(newMap)
                    await saveOutline(newMap)
                    toast.success('Sort applied')
                  }}>Apply & Save</button>
                  <button className="px-2 py-1 text-xs rounded border border-border hover:bg-accent" onClick={()=> setPreviewSort('none')}>Clear</button>
                </div>
              )}
              <div className="pt-1 border-t border-border" />
              <button className="px-2 py-1 text-sm rounded border border-border hover:bg-accent" onClick={()=>expandCollapseAll(true)}>Expand all</button>
              <button className="px-2 py-1 text-sm rounded border border-border hover:bg-accent" onClick={()=>expandCollapseAll(false)}>Collapse all</button>
              <button className="px-2 py-1 text-sm rounded border border-border hover:bg-accent" onClick={async ()=>{ const md = generateOutlineMarkdown(); try{ await navigator.clipboard.writeText(md); toast.success('Copied outline to clipboard') } catch{ toast.error('Copy failed') } }}>Copy List</button>
              <div className="text-[10px] text-muted-foreground">Outline is virtual; moving items here does not affect files on disk.</div>
            </div>
          </div>
          <div className="pr-64">
            {renderOutlineTree('nodes', 0)}
          </div>
        </div>
      )}
      {subView === 'progression' && (
        <div className="h-full w-full relative">
          <ProgressionPanel onSwitchSubView={(v)=> setSubView(v)} tabId={activeGraphTabId} />
        </div>
      )}
      
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          edgeId={contextMenu.edgeId}
          isFolder={contextMenu.isFolder || contextMenu.nodeId === 'nodes'}
          hasTask={contextMenu.hasTask}
          onExportMapAsPng={contextMenu.nodeId ? undefined : exportMapAsPng}
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
          onToggleLock={async (nodeId) => {
            try {
              const node = useNodeStore.getState().nodes.get(nodeId)
              if (!node) return
              const currentLocked = nodeId === 'nodes' ? (node.metadata?.locked !== false) : !!node.metadata?.locked
              const nextLocked = !currentLocked
              await updateNode(nodeId, { metadata: { locked: nextLocked } as any })
              toast.success(nextLocked ? 'Node locked' : 'Node unlocked')
            } catch (e) {
              toast.error('Failed to toggle lock')
            }
          }}
          isLocked={(() => {
            const id = contextMenu.nodeId || ''
            const n = verbweaverNodes.get(id)
            if (!n) return false
            return id === 'nodes' ? (n.metadata?.locked !== false) : !!n.metadata?.locked
          })()}
          onToggleCollapse={(nodeId) => { if (nodeId) toggleFolderCollapsed(nodeId); setContextMenu(null) }}
          isCollapsed={(() => {
            const id = contextMenu.nodeId || ''
            return !!graphCollapsed[id]
          })()}
          onRemoveLinks={(nodeId) => openRemoveLinksForNode(nodeId)}
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

      {/* Remove Links Modal for Mind Map */}
      <RemoveLinksModal
        isOpen={removeLinksOpen}
        linkedNodes={(() => {
          if (!removeLinksNodePath) return []
          const source = verbweaverNodes.get(removeLinksNodePath)
          if (!source || !Array.isArray(source.softLinks)) return []
          const results: { path: string; title: string }[] = []
          for (const targetId of source.softLinks) {
            const target = Array.from(verbweaverNodes.values()).find(n => n.metadata?.id === targetId)
            if (target) results.push({ path: target.path, title: target.metadata?.title || target.name })
          }
          // De-duplicate by path
          const uniq = new Map<string, { path: string; title: string }>()
          results.forEach(r => uniq.set(r.path, r))
          return Array.from(uniq.values()).sort((a, b) => a.title.localeCompare(b.title))
        })()}
        onClose={() => { setRemoveLinksOpen(false); setRemoveLinksNodePath(null) }}
        onRemoveSelected={async (paths) => {
          try {
            if (!removeLinksNodePath) return
            for (const p of paths) {
              await removeSoftLink(removeLinksNodePath, p)
            }
            await loadNodes()
            toast.success('Link(s) removed')
          } catch (e) {
            toast.error('Failed to remove link(s)')
          } finally {
            setRemoveLinksOpen(false)
            setRemoveLinksNodePath(null)
          }
        }}
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