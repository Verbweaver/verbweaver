import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Node,
  Edge,
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
  type OnSelectionChangeParams,
} from '@xyflow/react'
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
import SharedCreateLinkModal from '../components/common/CreateLinkModal'
import { FileStorage, StoredFile } from '../utils/fileStorage'
import { getLinkedNodes } from '../utils/nodeLinks'
import { attachFilesToNode } from '../utils/nodeAttachments'
import { Paperclip, Filter, ListTree, Loader2, LineChart, Network, Layers, HelpCircle, ImageDown } from 'lucide-react'
import NodeFiltersDialog, { NodeFilterState, DEFAULT_FILTERS } from '../components/NodeFiltersDialog'
import { isFilterActive, buildLinkedTargets, matchesNodeFilters, summarizeFilters } from '../utils/nodeFilters'
// @ts-ignore: type stub provided in global.d.ts; package installed at runtime
import * as htmlToImage from 'html-to-image'
import clsx from 'clsx'
import { HELP_DOCS, HELP_GRAPH_SECTIONS, STORAGE_KEYS } from '@verbweaver/shared'
import { useOpenHelp } from '../hooks/useOpenHelp'
import LayoutControls from '../components/graph/LayoutControls'
import { editorApi } from '../api/editorApi'
import { projectsApi } from '../api/projects'
import yaml from 'js-yaml'
import ConfirmDialog from '../components/ConfirmDialog'
import { NODE_TYPES } from '@verbweaver/shared'
import toast from 'react-hot-toast'
import { createNodeFromTemplateDesktop } from '../api/desktop-templates';
import ProgressionPanel from '../components/progression/ProgressionPanel'
import GroupView from '../views/GroupView'
import GroupManagerPanel from '../components/GroupManagerPanel'
import GroupOptionsTray from '../components/GroupOptionsTray'
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
// Absolute path of a project's outline/positions file
const outlineAbsPath = (projectPath: string) =>
  `${projectPath}/.verbweaver/outline.yaml`.replace(/\\/g, '/').replace(/\/\//g, '/')
// Any of these held while clicking a node toggles it in/out of the selection
const MULTI_SELECT_KEYS = ['Shift', 'Control', 'Meta']

function GraphView() {
  const navigate = useNavigate()
  const location = useLocation()
  const reactFlow = useReactFlow()
  const focusAppliedRef = useRef<string | null>(null)
  const { currentProject, currentProjectPath } = useProjectStore()
  const { nodes: verbweaverNodes, loadNodes, updateNode, createNode, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  // The Graph tab this view is showing. Filters, sub-view and title are kept per Graph tab, and
  // the same Graph stays mounted when you switch between two Graph tabs.
  const activeGraphTabId = useTabStore(s => {
    const tab = s.tabs.find(t => t.id === s.activeTabId)
    return tab && tab.type === 'graph' ? tab.id : undefined
  })
  // The Graph tab whose state is on screen. Saving waits until it matches activeGraphTabId, so
  // one tab's filters or sub-view are never written into another tab while switching.
  const [restoredTabId, setRestoredTabId] = useState<string | undefined>(undefined)
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string; isFolder?: boolean; hasTask?: boolean } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  // Template picked from the canvas menu's "From Template" list, preselected in the dialog
  const [initialTemplatePath, setInitialTemplatePath] = useState<string | undefined>()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [pendingNodePosition, setPendingNodePosition] = useState<{ x: number; y: number } | undefined>()
  const [parentPathForNewNode, setParentPathForNewNode] = useState<string>('')
  const [confirmState, setConfirmState] = useState<{ open: boolean; nodeId?: string; nodeName?: string }>({ open: false })
  // Object (not string) so re-attaching to the same node after a cancelled picker re-opens it
  const [attachTarget, setAttachTarget] = useState<{ path: string } | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [multiDeleteOpen, setMultiDeleteOpen] = useState(false)
  // Selection that existed when a Shift+drag selection box started; the box adds to it
  const boxSelectionBaseRef = useRef<Set<string> | null>(null)
  const [removeLinksOpen, setRemoveLinksOpen] = useState(false)
  const [removeLinksNodePath, setRemoveLinksNodePath] = useState<string | null>(null)
  const [createLinkNodePath, setCreateLinkNodePath] = useState<string | null>(null)
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)
  // Stable fallback positions for nodes without saved positions (prevents re-randomizing)
  const fallbackPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  // Track last graph signatures to avoid redundant updates that can cause render loops
  const lastGraphSigsRef = useRef<{ nodes: string; edges: string }>({ nodes: '', edges: '' })
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

  // Filters state
  const [filters, setFilters] = useState<NodeFilterState>(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Persist filters per tab so they survive tab switches
  useEffect(() => {
    if (!activeGraphTabId || restoredTabId !== activeGraphTabId) return
    useTabStore.getState().updateTabMetadata(activeGraphTabId, (prev: any) => ({ ...(prev || {}), graphFilters: filters } as any))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, restoredTabId])

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
  // Latest positions/collapsed state, for saves made from callbacks
  const graphPositionsRef = useRef(graphPositions)
  graphPositionsRef.current = graphPositions
  const graphCollapsedRef = useRef(graphCollapsed)
  graphCollapsedRef.current = graphCollapsed
  // Where positions are stored for the open project (desktop: project folder; web: project id).
  // Saves are only allowed once the saved state for this key has been read (#111, #112).
  const storageKey = isElectron ? (currentProjectPath || null) : (currentProject?.id ? String(currentProject.id) : null)
  const loadedForRef = useRef<string | null>(null)
  const lastSavedRef = useRef<string>('')
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  // Outline subview state
  type GraphSubView = 'mindmap' | 'outline' | 'progression' | 'group'
  const openHelp = useOpenHelp()
  const savedSubView = (tabId?: string): GraphSubView => {
    const tab = tabId ? useTabStore.getState().getTabById(tabId) : undefined
    const saved = (tab?.metadata as any)?.graphSubView as GraphSubView | undefined
    return saved === 'outline' || saved === 'mindmap' || saved === 'progression' || saved === 'group' ? saved : 'mindmap'
  }
  const [subView, setSubView] = useState<GraphSubView>(() => savedSubView(activeGraphTabId))
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['nodes']))
  const [outlineOrder, setOutlineOrder] = useState<Record<string, string[]>>({}) // parent -> ordered child ids
  const outlineFilePath = '.verbweaver/outline.yaml'

  const toggleExpand = (path: string) => setExpanded(prev => { const n = new Set(prev); n.has(path)? n.delete(path): n.add(path); return n })
  const expandCollapseAll = (expandAll: boolean) => {
    const parents = new Set<string>()
    verbweaverNodes.forEach(n => { if (n.hardLinks.parent) parents.add(n.hardLinks.parent) })
    setExpanded(expandAll ? parents : new Set())
  }

  // Load outline order, folder positions and collapsed state for the open project
  // (web: project settings; electron: .verbweaver/outline.yaml). Nothing is saved until this
  // has finished for the current project, so defaults can't overwrite saved positions (#111, #112).
  useEffect(() => {
    let cancelled = false
    setPositionsReady(false)
    loadedForRef.current = null
    setGraphPositions({})
    setGraphCollapsed({})
    setOutlineOrder({})
    const key = storageKey
    if (!currentProject?.id || !key) return
    ;(async () => {
      let outline: Record<string, string[]> = {}
      let positions: Record<string, { x: number; y: number }> = {}
      let collapsed: Record<string, boolean> = {}
      // False when stored state exists but couldn't be read: show defaults, but don't save over it
      let canSave = true
      try {
        if (!isElectron) {
          const settings: any = await projectsApi.getProjectSettings(currentProject.id)
          if (settings && typeof settings.outlineMap === 'object') outline = settings.outlineMap
          if (settings && typeof settings.graphPositions === 'object') positions = settings.graphPositions
          if (settings && typeof settings.graphCollapsed === 'object') collapsed = settings.graphCollapsed
        } else if (window.electronAPI) {
          let content = ''
          try {
            content = await window.electronAPI.readFile(outlineAbsPath(key))
          } catch (e) {
            // A missing file just means nothing has been saved yet
            if (!/ENOENT/.test(String(e))) throw e
          }
          const parsed: any = yaml.load(content || '') || {}
          if (parsed && typeof parsed.outline === 'object') outline = parsed.outline || {}
          if (parsed && typeof parsed.graph_positions === 'object') positions = parsed.graph_positions || {}
          if (parsed && typeof parsed.graph_collapsed === 'object') collapsed = parsed.graph_collapsed || {}
        }
      } catch (e) {
        console.warn('[Graph] Failed to load saved outline/positions; changes will not be saved', e)
        canSave = false
      }
      if (cancelled) return
      setOutlineOrder(outline)
      setGraphPositions(positions)
      setGraphCollapsed(collapsed)
      graphPositionsRef.current = positions
      graphCollapsedRef.current = collapsed
      lastSavedRef.current = JSON.stringify([positions, collapsed])
      loadedForRef.current = canSave ? key : null
      setPositionsReady(true)
    })()
    return () => { cancelled = true }
  }, [currentProject?.id, storageKey])

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

  // Persist the sub-view per Graph tab and name the tab after it
  useEffect(() => {
    if (!activeGraphTabId || restoredTabId !== activeGraphTabId) return
    const { updateTabMetadata, updateTab, getTabById } = useTabStore.getState()
    updateTabMetadata(activeGraphTabId, (prev) => ({ ...(prev || {}), graphSubView: subView } as any))
    const title = subView === 'mindmap'
      ? 'Graph - Mind Map'
      : subView === 'outline'
      ? 'Graph - Outline'
      : subView === 'progression'
      ? 'Graph - Progression'
      : 'Graph - Group'
    if (getTabById(activeGraphTabId)?.title !== title) updateTab(activeGraphTabId, { title })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subView, restoredTabId])

  // Show the saved filters and sub-view of the Graph tab you switch to. Declared after the
  // saving effects so, on a switch, those run first and skip (restoredTabId is still the old tab).
  useEffect(() => {
    if (!activeGraphTabId) return
    const saved = (useTabStore.getState().getTabById(activeGraphTabId)?.metadata as any)?.graphFilters as NodeFilterState | undefined
    setFilters(saved && typeof saved === 'object' ? { ...DEFAULT_FILTERS, ...saved } : DEFAULT_FILTERS)
    setSubView(savedSubView(activeGraphTabId))
    setRestoredTabId(activeGraphTabId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGraphTabId])

  // Save the Outline order, leaving the other stored keys (positions, collapsed) as they are
  const saveOutline = async (map: Record<string, string[]>) => {
    if (!currentProject?.id) return
    const run = async () => {
      try {
        if (!isElectron) {
          // Web: store in project settings to avoid file API constraints
          const settings = await projectsApi.getProjectSettings(currentProject.id)
          await projectsApi.updateProjectSettings(currentProject.id, { ...(settings || {}), outlineMap: map })
        } else if (window.electronAPI && currentProjectPath) {
          const abs = outlineAbsPath(currentProjectPath)
          let parsed: any = {}
          try { parsed = yaml.load(await window.electronAPI.readFile(abs) || '') || {} } catch {}
          parsed.outline = map
          await window.electronAPI.writeFile(abs, yaml.dump(parsed))
        } else {
          await editorApi.writeFile(currentProject.id, outlineFilePath, yaml.dump({ outline: map }))
        }
      } catch (e) {
        console.warn('Failed to save outline', e)
      }
    }
    // Queue behind other saves so read-merge-write calls don't interleave
    saveChainRef.current = saveChainRef.current.then(run, run)
    await saveChainRef.current
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
        const abs = outlineAbsPath(currentProjectPath)
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
    } catch (e) {
      console.warn('[Graph] Failed to save folder positions', e)
    }
  }, [currentProject?.id, currentProjectPath, outlineOrder])

  // Save folder positions and collapsed state, but only once the stored state for this project
  // has been loaded, only when something changed, and one write at a time (#111, #112)
  const saveGraphState = useCallback((positions: Record<string, { x: number; y: number }>, collapsed: Record<string, boolean>) => {
    if (!storageKey || loadedForRef.current !== storageKey) return
    const snapshot = JSON.stringify([positions, collapsed])
    if (snapshot === lastSavedRef.current) return
    lastSavedRef.current = snapshot
    const run = () => persistGraphState(positions, collapsed)
    saveChainRef.current = saveChainRef.current.then(run, run)
  }, [storageKey, persistGraphState])

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
      
      // Delete and Rigid mode act on the Mind Map only; its selection is hidden in other sub-views (#100)
      const inMindMap = subView === 'mindmap'
      if (inMindMap && (e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
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
      if (inMindMap && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'a') {
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
  }, [selectedNodeIds, subView, verbweaverNodes, setNodes])

  // Leaving the Mind Map clears its selection, so nothing acts on nodes you can't see (#100)
  useEffect(() => {
    if (subView === 'mindmap') return
    setSelectedNodeIds(prev => (prev.size === 0 ? prev : new Set()))
    setNodes(prev => (prev.some(n => n.selected) ? prev.map(n => (n.selected ? { ...n, selected: false } : n)) : prev))
  }, [subView, setNodes])

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
      // Observe class only; style mutations can be noisy and cause update loops
      attributeFilter: ['class']
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

  // Helper function to check if a node matches the filters (defined inline in useEffect to avoid infinite loops)

  // Load and convert nodes when project changes or nodes update
  useEffect(() => {
    if (!currentProject || !positionsReady) return
    let cancelled = false
    if (currentProject && positionsReady) {
      // Equality helpers to avoid unnecessary state updates → prevents render loops
      const nodesEqual = (a: Node[], b: Node[]) => {
        if (a === b) return true
        if (!Array.isArray(a) || !Array.isArray(b)) return false
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
          const na = a[i] as any
          const nb = b[i] as any
          if (na.id !== nb.id) return false
          if (na.type !== nb.type) return false
          if (!na.position || !nb.position) return false
          if (na.position.x !== nb.position.x || na.position.y !== nb.position.y) return false
          // Common fields used by CustomNode rendering/logic
          const da = na.data || {}
          const db = nb.data || {}
          if (!!da.locked !== !!db.locked) return false
          if (da.type !== db.type) return false
          if (!!da.isDirectory !== !!db.isDirectory) return false
        }
        return true
      }
      const edgesEqual = (a: Edge[], b: Edge[]) => {
        if (a === b) return true
        if (!Array.isArray(a) || !Array.isArray(b)) return false
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
          const ea = a[i] as any
          const eb = b[i] as any
          if (ea.id !== eb.id) return false
          if (ea.source !== eb.source || ea.target !== eb.target) return false
          if (ea.sourceHandle !== eb.sourceHandle || ea.targetHandle !== eb.targetHandle) return false
          if (ea.type !== eb.type) return false
        }
        return true
      }
      // Helper function to check if a node matches the filters (shared rules, #34)
      const usingFilters = isFilterActive(filters)
      const linkedTargets = usingFilters ? buildLinkedTargets(filters, verbweaverNodes.values()) : null
      const nodeMatchesFilters = (node: any): boolean => !usingFilters || matchesNodeFilters(node, filters, linkedTargets)

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

        // Apply filters
        if (!nodeMatchesFilters(node)) return

        // Compute position (deterministic fallbacks to avoid update loops)
        const position = (() => {
          if (node.path === 'nodes') {
            const persisted = graphPositions['nodes']
            if (persisted && typeof persisted.x === 'number' && typeof persisted.y === 'number') return persisted
            return { x: 0, y: 0 }
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
          if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved
          // Deterministic fallback based on path; cache result
          const cached = fallbackPositionsRef.current.get(node.path)
          if (cached) return cached
          // Simple string hash
          const s = node.path
          let h = 0
          for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
          const x = ((h >>> 0) % 800) + 50
          const y = (((h * 2654435761) >>> 0) % 500) + 50
          const pos = { x, y }
          fallbackPositionsRef.current.set(node.path, pos)
          return pos
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
          position: (typeof graphPositions['nodes']?.x === 'number' && typeof graphPositions['nodes']?.y === 'number') ? graphPositions['nodes'] : { x: 0, y: 0 },
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
      
      // Only update state when contents actually changed to avoid triggering loops
      if (!cancelled) {
        // Build deterministic signatures independent of array ordering
        const nodeSig = flowNodes
          .map(n => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${n.type}:${(n as any).data?.locked?'1':'0'}:${(n as any).data?.isDirectory?'1':'0'}:${(n as any).data?.type||''}`)
          .sort()
          .join('|')
        const edgeSig = flowEdges
          .map(e => `${e.id}:${e.source}:${e.target}:${(e as any).sourceHandle||''}:${(e as any).targetHandle||''}:${e.type||''}`)
          .sort()
          .join('|')

        const prevNodesSig = lastGraphSigsRef.current.nodes
        const prevEdgesSig = lastGraphSigsRef.current.edges

        const nodesChanged = nodeSig !== prevNodesSig
        const edgesChanged = edgeSig !== prevEdgesSig

        if (nodesChanged) {
          // flowNodes are rebuilt from scratch and carry no selection; keep what React Flow had
          // selected so a rebuild (e.g. after a drag saves positions) doesn't deselect nodes (#71)
          setNodes(prev => {
            const selected = new Set(prev.filter(n => n.selected).map(n => n.id))
            if (selected.size === 0) return flowNodes
            return flowNodes.map(n => (selected.has(n.id) ? { ...n, selected: true } : n))
          })
          lastGraphSigsRef.current.nodes = nodeSig
        }
        if (edgesChanged) {
          setEdges(flowEdges)
          lastGraphSigsRef.current.edges = edgeSig
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true }
  }, [currentProject, positionsReady, verbweaverNodes, hideUploads, graphCollapsed, hideCompletedTasks, isTaskCompleted, showOneWayLinks, themeColors, filters, rigidMode, graphPositions])

  // Handle node drag
  const onNodeDragStop = useCallback(
    (_: any, node: Node, dragged?: Node[]) => {
      // When a selection is dragged, React Flow passes every moved node; handle all of them
      const moved = (dragged && dragged.length > 0 ? dragged : [node])
        // Prevent drag persistence when locked
        .filter(n => !(n.data as any)?.locked)
      if (moved.length === 0) return
      // Folder positions live in graphPositions (kept in memory either way, saved only in Rigid mode)
      const folderPositions: Record<string, { x: number; y: number }> = {}
      moved.forEach(n => {
        const isFolder = (n.data as any)?.isDirectory || (n.data as any)?.type === 'folder' || n.id === 'nodes'
        if (isFolder) folderPositions[n.id] = { x: n.position.x, y: n.position.y }
      })
      if (Object.keys(folderPositions).length > 0) {
        const next = { ...graphPositionsRef.current, ...folderPositions }
        graphPositionsRef.current = next
        setGraphPositions(next)
        if (rigidMode) saveGraphState(next, graphCollapsedRef.current)
      }
      // Only persist page positions when rigid mode is ON
      if (rigidMode) {
        moved.forEach(n => {
          updateNode(n.id, {
            metadata: { position: n.position }
          }).catch((err: any) => {
            // Surface details to help diagnose failures in Electron/web
            try {
              // eslint-disable-next-line no-console
              console.error('[Graph] Failed to save node position', { id: n.id, position: n.position, error: err })
            } catch {}
            toast.error('Failed to save node position')
          })
        })
      }
      // After moving, recompute edge handles to ensure closest-side attachments
      setEdges(prev => {
        const movedPositions = new Map(moved.map(n => [n.id, n.position]))
        const nodePositions = new Map(nodes.map(n => [n.id, movedPositions.get(n.id) ?? n.position]))
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
    [updateNode, nodes, setEdges, rigidMode, saveGraphState]
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
    (event: React.MouseEvent | MouseEvent) => {
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
    const styled: Array<{ el: HTMLElement; prev: { color?: string; backgroundColor?: string; borderColor?: string; fill?: string; stroke?: string; fontSize?: string; fontFamily?: string; fontWeight?: string } }> = []
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
        const prev = { color: h.style.color, fill: (h.style as any).fill, fontSize: h.style.fontSize, fontFamily: h.style.fontFamily, fontWeight: h.style.fontWeight }
        const textFill = (cs as any).fill && (cs as any).fill !== 'none' ? (cs as any).fill : cs.color
        if (textFill) (h.style as any).fill = textFill
        // Also set color for HTML fallback
        h.style.color = textFill
        // Keep the label's font: its size comes from a React Flow class the image doesn't carry, so
        // the text grew past its background box in the saved picture (#148)
        h.style.fontSize = cs.fontSize
        h.style.fontFamily = cs.fontFamily
        h.style.fontWeight = cs.fontWeight
        styled.push({ el: h, prev })
      })

      // Fit all nodes into view
      try {
        const all = nodes.map(n => n.id)
        if (all.length > 0) {
          // includeHiddenNodes in case some are filtered by UI; fit all nodes without unsafe casts
          // fitView is async since React Flow 12; wait so the image shows the fitted viewport
          await reactFlow.fitView({ includeHiddenNodes: true, padding: 0.2 })
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
        // At least 2x, like the Group view, so saved maps stay sharp on standard displays (#148)
        pixelRatio: Math.max(2, window.devicePixelRatio || 1),
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
          if (s.prev.fontSize !== undefined) s.el.style.fontSize = s.prev.fontSize
          if (s.prev.fontFamily !== undefined) s.el.style.fontFamily = s.prev.fontFamily
          if (s.prev.fontWeight !== undefined) s.el.style.fontWeight = s.prev.fontWeight
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

  // Handle unlinking edges. Only soft links (between pages) can be unlinked; folder lines
  // ("contains") come from where files are stored, so the menu shows Unlink disabled for them (#101)
  const handleUnlinkEdge = useCallback(
    async (edgeId: string) => {
      try {
        const edge = edges.find(e => e.id === edgeId)
        if (!edge || !edgeId.startsWith('soft_')) {
          toast.error('Only links between pages can be unlinked')
          return
        }
        // Soft-link edges run from the linking page's path to the linked page's path
        await removeSoftLink(edge.source, edge.target)
        setEdges((eds) => eds.filter(e => e.id !== edgeId))
        toast.success('Link removed')
      } catch (error) {
        console.error('Failed to remove link:', error)
        toast.error('Failed to remove link')
      } finally {
        setContextMenu(null)
      }
    },
    [edges, removeSoftLink, setEdges]
  )

  // Handle creating new node
  const handleCreateNode = useCallback(
    async (type: string, position?: { x: number; y: number }, templatePath?: string) => {
      setPendingNodePosition(position)
      setParentPathForNewNode('')
      setInitialTemplatePath(templatePath)
      
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
      setInitialTemplatePath(undefined)
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
      
      // Open (or switch to) the file's editor tab
      navigate(useTabStore.getState().openFileInTab(nodeId, nodeName))
      setContextMenu(null)
    },
    [navigate, verbweaverNodes]
  )

  const openRemoveLinksForNode = useCallback((nodePath: string) => {
    setRemoveLinksNodePath(nodePath)
    setRemoveLinksOpen(true)
    setContextMenu(null)
  }, [])

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
      const folderPositions: Record<string, { x: number; y: number }> = {}
      layoutedNodes.forEach(n => {
        const isFolder = (n.data as any)?.isDirectory || (n.data as any)?.type === 'folder' || n.id === 'nodes'
        if (isFolder) folderPositions[n.id] = { x: n.position.x, y: n.position.y }
      })
      const next = { ...graphPositionsRef.current, ...folderPositions }
      graphPositionsRef.current = next
      setGraphPositions(next)
      if (rigidMode) saveGraphState(next, graphCollapsedRef.current)
      toast.success('Layout applied')
    }).catch(() => {
      toast.error('Failed to save layout positions')
    })
  }, [nodes, edges, setNodes, setEdges, updateNode, chooseHandleIds, rigidMode, saveGraphState])

  // Toggle collapsed state for a folder and persist immediately
  const toggleFolderCollapsed = useCallback((folderPath: string) => {
    const prev = graphCollapsedRef.current
    const next = { ...prev, [folderPath]: !prev[folderPath] }
    graphCollapsedRef.current = next
    setGraphCollapsed(next)
    saveGraphState(graphPositionsRef.current, next)
  }, [saveGraphState])

  // -------- Outline helpers --------
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | 'into' | null>(null)
  // Releasing the mouse anywhere ends an Outline drag; row handlers run first and do the move
  useEffect(() => {
    if (!draggingId) return
    const end = () => { setDraggingId(null); setDragOverId(null); setDragOverPos(null) }
    window.addEventListener('mouseup', end)
    return () => window.removeEventListener('mouseup', end)
  }, [draggingId])
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
                  if (!draggingId) return
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
                  <button className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent" onClick={()=>{ navigate(useTabStore.getState().openFileInTab(n.path, n.name)) }}>Edit</button>
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
                    if (!draggingId) return
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

  // Selection is React Flow's own: Shift/Ctrl/Cmd+click toggles a node, Shift+drag draws a box.
  // We only mirror it into selectedNodeIds, plus make a Shift+drag box add to the existing
  // selection (React Flow's box replaces it). The handler must stay stable: React Flow 12 re-runs
  // onSelectionChange whenever its identity changes, which loops when it sets state.
  const latestSelectionRef = useRef<Set<string>>(new Set())
  const pendingBoxBaseRef = useRef<Set<string> | null>(null)
  const applyBoxUnion = useCallback((boxIds: Set<string>) => {
    const base = boxSelectionBaseRef.current
    if (!base) return boxIds
    const union = new Set(base)
    boxIds.forEach(id => union.add(id))
    setNodes(prev => prev.map(n => (n.selected === union.has(n.id) ? n : { ...n, selected: union.has(n.id) })))
    return union
  }, [setNodes])
  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const ids = applyBoxUnion(new Set((params.nodes || []).map(n => n.id)))
    latestSelectionRef.current = ids
    setSelectedNodeIds(ids)
  }, [applyBoxUnion])
  // Snapshot the selection before React Flow clears it for a new box. Taken at pointer-down
  // (capture, ahead of React Flow) and only used if that pointer-down becomes a box selection.
  const handleCanvasPointerDownCapture = useCallback((e: React.PointerEvent) => {
    pendingBoxBaseRef.current = e.shiftKey ? new Set(latestSelectionRef.current) : null
  }, [])
  const handleSelectionStart = useCallback(() => {
    boxSelectionBaseRef.current = pendingBoxBaseRef.current
  }, [])
  const handleSelectionEnd = useCallback(() => {
    // Re-apply once in case React Flow's final box update landed after the last union
    const ids = applyBoxUnion(new Set(latestSelectionRef.current))
    latestSelectionRef.current = ids
    setSelectedNodeIds(ids)
    boxSelectionBaseRef.current = null
    pendingBoxBaseRef.current = null
  }, [applyBoxUnion])

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
    <div className="h-full w-full">
      {/* Right-side panel (Mind Map/Outline switch + per-view controls) is rendered per subview below */}

      {subView === 'mindmap' && (
      <div ref={reactFlowWrapperRef} className="h-full w-full" onPointerDownCapture={handleCanvasPointerDownCapture}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
        onSelectionChange={handleSelectionChange}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        selectNodesOnDrag
        selectionKeyCode="Shift"
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
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
            <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('group')} title="Group"><span className="inline-flex items-center gap-1"><Layers className="w-4 h-4"/>Group</span></button>
            <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('outline')} title="Outline"><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
            <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('progression')} title="Progression"><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
            <div className="pt-1 border-t border-border" />
            <button className={'px-2 py-1 text-sm'} onClick={()=>openHelp(HELP_DOCS.GRAPH, HELP_GRAPH_SECTIONS.MIND_MAP)} title="Open Mind Map User Guide"><span className="inline-flex items-center gap-1"><HelpCircle className="w-4 h-4"/>Help</span></button>
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
                <button
                  className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent flex items-center gap-2"
                  onClick={() => setFiltersOpen(true)}
                  title="Filter visible nodes by path, tags, keywords, dates, and more"
                >
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent flex items-center gap-2"
                  onClick={() => { void exportMapAsPng() }}
                  title="Save the whole map as a PNG picture"
                >
                  <ImageDown className="w-4 h-4" />
                  <span>Save Image</span>
                </button>
                {(() => {
                  // Shared summary, so paths and Include/Exclude show here too (#34, #35)
                  const summary = summarizeFilters(filters)
                  if (!summary) return null
                  return (
                    <div className="text-[11px] text-muted-foreground px-2 py-1 border border-border rounded bg-background/60"
                         title={summary}>
                      Active filters: {summary}
                    </div>
                  )
                })()}
                <div className="text-[11px] text-muted-foreground px-1">
                  Shift+drag to box-select · Shift/Ctrl+click to add or remove
                </div>
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

      {subView === 'group' && (
        <div className="h-full w-full relative">
          {/* Right-side panel for Group view: sub-view switcher */}
          <div className="absolute top-2 right-2 z-30 pointer-events-auto">
            <div className="bg-background/80 border border-border rounded p-2 shadow flex flex-col gap-2 items-stretch w-80">
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('mindmap')}><span className="inline-flex items-center gap-1"><Network className="w-4 h-4"/>Mind Map</span></button>
              <button className={'px-2 py-1 bg-accent rounded text-sm'} onClick={()=>setSubView('group')} disabled><span className="inline-flex items-center gap-1"><Layers className="w-4 h-4"/>Group</span></button>
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('outline')}><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('progression')}><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
              <div className="pt-1 border-t border-border" />
              <button className={'px-2 py-1 text-sm'} onClick={()=>openHelp(HELP_DOCS.GRAPH, HELP_GRAPH_SECTIONS.GROUP)} title="Open Group User Guide"><span className="inline-flex items-center gap-1"><HelpCircle className="w-4 h-4"/>Help</span></button>
              <div className="pt-1 border-t border-border" />
              <GroupManagerPanel />
            </div>
          </div>
          {/* Left options tray */}
          <div className="absolute top-2 left-2 z-10 pointer-events-auto">
            <GroupOptionsTray projectId={currentProject?.id} tabId={activeGraphTabId} />
          </div>
          {/* Canvas */}
          <GroupView />
        </div>
      )}

      {subView === 'outline' && (
        <div className="h-full w-full overflow-auto p-3 text-foreground relative z-0">
          {/* Outline right-side panel */}
          <div className="absolute top-2 right-2 z-30 pointer-events-auto">
            <div className="bg-background/80 border border-border rounded p-2 shadow flex flex-col gap-2 items-stretch w-56">
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('mindmap')}><span className="inline-flex items-center gap-1"><Network className="w-4 h-4"/>Mind Map</span></button>
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('group')}><span className="inline-flex items-center gap-1"><Layers className="w-4 h-4"/>Group</span></button>
              <button className={'px-2 py-1 bg-accent rounded text-sm'} onClick={()=>setSubView('outline')} disabled><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
              <button className={'px-2 py-1 text-sm'} onClick={()=>setSubView('progression')}><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
              <div className="pt-1 border-t border-border" />
              <button className={'px-2 py-1 text-sm'} onClick={()=>openHelp(HELP_DOCS.GRAPH, HELP_GRAPH_SECTIONS.OUTLINE)} title="Open Outline User Guide"><span className="inline-flex items-center gap-1"><HelpCircle className="w-4 h-4"/>Help</span></button>
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
          onExportMapAsPng={contextMenu.nodeId || contextMenu.edgeId ? undefined : exportMapAsPng}
          unlinkDisabledReason={contextMenu.edgeId && !contextMenu.edgeId.startsWith('soft_') ? 'This line shows a folder holding a page. To change it, move the page to another folder.' : undefined}
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
          onAttachFiles={(nodeId) => setAttachTarget({ path: nodeId })}
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
          onCreateLink={(nodeId) => { setCreateLinkNodePath(nodeId); setContextMenu(null) }}
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
        onClose={() => { setTemplateDialogOpen(false); setInitialTemplatePath(undefined) }}
        onSelectTemplate={handleTemplateSelected}
        parentPath={parentPathForNewNode}
        initialTemplatePath={initialTemplatePath}
      />

      {/* Create Link Modal (context menu) */}
      {createLinkNodePath && (
        <SharedCreateLinkModal
          currentNodePath={createLinkNodePath}
          onClose={() => setCreateLinkNodePath(null)}
          onLinkCreated={async () => {
            // Refresh from source-of-truth so the new edge renders (mirrors onConnect)
            try { await loadNodes() } catch (err) { console.error('[Graph] Failed to refresh after creating link', err) }
            toast.success('Link created')
          }}
        />
      )}

      {/* Remove Links Modal for Mind Map */}
      <RemoveLinksModal
        isOpen={removeLinksOpen}
        linkedNodes={getLinkedNodes(removeLinksNodePath ? verbweaverNodes.get(removeLinksNodePath) : undefined, verbweaverNodes)
          .map(n => ({ path: n.path, title: n.metadata?.title || n.name }))}
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
            const targetPath = attachTarget.path
            setAttachTarget(null)
            if (!files || files.length === 0 || !targetPath) return
            try {
              await attachFilesToNode(targetPath, files)
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
      <NodeFiltersDialog
        filters={filters}
        onFiltersChange={setFilters}
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
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