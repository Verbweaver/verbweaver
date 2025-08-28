import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, Check, CheckSquare } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { editorApi } from '../api/editorApi'
import clsx from 'clsx'
import { useNodeStore } from '../store/nodeStore'
import toast from 'react-hot-toast'

interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  loaded?: boolean
}

interface NodeSelectorProps {
  selectedNodes: string[]
  onSelectionChange: (selectedNodes: string[]) => void
  showFolders?: boolean // Whether to show folders as selectable items
  expandedDirs?: Set<string> // External expanded directories state
  onExpandedDirsChange?: (expandedDirs: Set<string>) => void // Callback for expanded directories changes
  filters?: NodeFilterState
  onFiltersChange?: (filters: NodeFilterState) => void
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

export interface NodeFilterState {
  tags: string[]
  tagsLogic: 'ANY' | 'ALL'
  nameKeyword: string
  descriptionKeyword: string
  startsWith: string
  endsWith: string
  startsEndsCaseSensitive: boolean
  startDateFrom?: string
  startDateTo?: string
  dueDateFrom?: string
  dueDateTo?: string
  hasAttachments: boolean
  linkedFromNodeTags: string[] // e.g., ['node-abc', 'node-xyz']
}

const DEFAULT_FILTERS: NodeFilterState = {
  tags: [],
  tagsLogic: 'ANY',
  nameKeyword: '',
  descriptionKeyword: '',
  startsWith: '',
  endsWith: '',
  startsEndsCaseSensitive: false,
  startDateFrom: undefined,
  startDateTo: undefined,
  dueDateFrom: undefined,
  dueDateTo: undefined,
  hasAttachments: false,
  linkedFromNodeTags: [],
}

function NodeSelector({ 
  selectedNodes, 
  onSelectionChange, 
  showFolders = false, 
  expandedDirs: externalExpandedDirs,
  onExpandedDirsChange,
  filters: externalFilters,
  onFiltersChange,
}: NodeSelectorProps) {
  const { currentProject, currentProjectPath } = useProjectStore()
  const { nodes: nodeMap, loadNodes } = useNodeStore()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [internalExpandedDirs, setInternalExpandedDirs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showNodesOnly, setShowNodesOnly] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = externalFilters || DEFAULT_FILTERS
  const startFromRef = useRef<HTMLInputElement | null>(null)
  const startToRef = useRef<HTMLInputElement | null>(null)
  const dueFromRef = useRef<HTMLInputElement | null>(null)
  const dueToRef = useRef<HTMLInputElement | null>(null)
  
  // Use external expandedDirs if provided, otherwise use internal state
  const expandedDirs = externalExpandedDirs !== undefined ? externalExpandedDirs : internalExpandedDirs

  // Sync internal state with external state when it changes
  useEffect(() => {
    if (externalExpandedDirs !== undefined) {
      setInternalExpandedDirs(externalExpandedDirs)
    }
  }, [externalExpandedDirs])

  // Load contents for directories that should be expanded
  useEffect(() => {
    const loadExpandedDirectories = async () => {
      if (!currentProjectPath || expandedDirs.size === 0) return
      
      // Find directories in the file tree that should be expanded but don't have loaded children
      const directoriesToLoad: FileNode[] = []
      
      const findDirectoriesToLoad = (nodes: FileNode[]) => {
        nodes.forEach(node => {
          if (node.type === 'directory' && expandedDirs.has(node.path) && !node.loaded) {
            directoriesToLoad.push(node)
          }
          if (node.children) {
            findDirectoriesToLoad(node.children)
          }
        })
      }
      
      findDirectoriesToLoad(fileTree)
      
      // Load contents for each directory that should be expanded
      for (const node of directoriesToLoad) {
        await loadDirectoryContents(node)
      }
    }
    
    loadExpandedDirectories()
  }, [expandedDirs, fileTree, currentProjectPath])
  





  const setExpandedDirs = (newExpandedDirs: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    if (onExpandedDirsChange) {
      const finalValue = typeof newExpandedDirs === 'function' ? newExpandedDirs(expandedDirs) : newExpandedDirs
      onExpandedDirsChange(finalValue)
    } else {
      setInternalExpandedDirs(newExpandedDirs)
    }
  }

  useEffect(() => {
    if (currentProject) {
      loadFileTree()
    }
  }, [currentProject, currentProjectPath, showNodesOnly])

  // Ensure nodes metadata loaded for filtering
  useEffect(() => {
    const ensure = async () => {
      try {
        if ((nodeMap?.size || 0) === 0) await loadNodes()
      } catch {}
    }
    ensure()
  }, [nodeMap?.size, loadNodes])

  const loadFileTree = async () => {
    if (!currentProjectPath) return

    setIsLoading(true)
    try {
      if (isElectron && window.electronAPI) {
        // Use Electron API for file system access
        let files = await window.electronAPI.readDirectory(currentProjectPath)
        
        // Filter to only show nodes directory if showNodesOnly is true
        if (showNodesOnly) {
          // Show the nodes directory and all its contents
          files = files.filter(file => {
            // Include the nodes directory itself
            if (file.path === 'nodes') return true
            // Include all files and subdirectories within nodes
            if (file.path.startsWith('nodes/')) return true
            return false
          })
        }
        
        const tree = buildFileTree(files)
        setFileTree(tree)
      } else {
        // For web version, use the API
        const apiTree = await editorApi.getFileTree(currentProject!.id)
        // Transform API response to match local FileNode interface
        const transformNode = (node: any): FileNode => ({
          id: node.path,
          name: node.name,
          path: node.path,
          type: node.type,
          children: node.children ? node.children.map(transformNode) : undefined,
          loaded: true // API returns fully loaded tree
        })
        let tree = apiTree.map(transformNode)
        
        // Filter to only show nodes directory if showNodesOnly is true
        if (showNodesOnly) {
          tree = tree.filter(node => {
            // Include the nodes directory itself
            if (node.path === 'nodes') return true
            // Include all files and subdirectories within nodes
            if (node.path.startsWith('nodes/')) return true
            return false
          })
        }
        
        setFileTree(tree)
      }
    } catch (error) {
      console.error('Failed to load file tree:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const buildFileTree = (files: Array<{ name: string; path: string; type: 'file' | 'directory' }>): FileNode[] => {
    const tree: FileNode[] = []
    const nodeMap = new Map<string, FileNode>()

    // Create nodes, excluding .gitkeep files
    files.forEach(file => {
      // Skip .gitkeep files as they are not actual nodes
      if (file.name === '.gitkeep') return
      
      const node: FileNode = {
        id: file.path,
        name: file.name,
        path: file.path,
        type: file.type,
        children: file.type === 'directory' ? [] : undefined
      }
      nodeMap.set(file.path, node)
    })

    // Build tree structure
    files.forEach(file => {
      const node = nodeMap.get(file.path)!
      const pathParts = file.path.split('/')
      const parentPath = pathParts.slice(0, -1).join('/')
      
      if (parentPath && nodeMap.has(parentPath)) {
        const parent = nodeMap.get(parentPath)!
        parent.children!.push(node)
      } else {
        tree.push(node)
      }
    })

    return tree
  }

  const loadDirectoryContents = async (node: FileNode) => {
    if (!currentProjectPath) return

    try {
      if (isElectron && window.electronAPI) {
        let files = await window.electronAPI.readDirectory(node.path)
        
        // Convert relative paths to absolute paths for proper tree building
        const absoluteFiles = files.map(file => ({
          ...file,
          path: file.path.startsWith('/') ? file.path : `${node.path}/${file.name}`
        }))
        
        // Filter to only show nodes directory if showNodesOnly is true
        if (showNodesOnly) {
          // Show the nodes directory and all its contents
          const filteredFiles = absoluteFiles.filter(file => {
            // Include the nodes directory itself
            if (file.path === 'nodes') return true
            // Include all files and subdirectories within nodes
            if (file.path.startsWith('nodes/')) return true
            return false
          })
          
          const children = buildFileTree(filteredFiles)
          node.children = children
        } else {
          const children = buildFileTree(absoluteFiles)
          node.children = children
        }
        
        node.loaded = true
        setFileTree([...fileTree]) // Trigger re-render
      } else {
        // For web API, we need to load the directory contents from the API
        try {
          const apiTree = await editorApi.getFileTree(currentProject!.id, node.path)
          const transformNode = (apiNode: any): FileNode => ({
            id: apiNode.path,
            name: apiNode.name,
            path: apiNode.path,
            type: apiNode.type,
            children: apiNode.children ? apiNode.children.map(transformNode) : undefined,
            loaded: true
          })
          
          // Filter to only show nodes directory if showNodesOnly is true
          let tree = apiTree.map(transformNode)
          if (showNodesOnly) {
            tree = tree.filter(apiNode => {
              // Include the nodes directory itself
              if (apiNode.path === 'nodes') return true
              // Include all files and subdirectories within nodes
              if (apiNode.path.startsWith('nodes/')) return true
              return false
            })
          }
          
          node.children = tree
          node.loaded = true
          setFileTree([...fileTree]) // Trigger re-render
        } catch (error) {
          console.error('Failed to load directory contents from API:', error)
          node.children = []
          node.loaded = true
          setFileTree([...fileTree]) // Trigger re-render
        }
      }
    } catch (error) {
      console.error('Failed to load directory contents:', error)
    }
  }

  const toggleDirectory = async (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path)
    
    if (!isExpanded && !node.loaded) {
      await loadDirectoryContents(node)
    }
    
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(node.path)) {
        next.delete(node.path)
      } else {
        next.add(node.path)
      }
      return next
    })
  }

  const handleNodeToggle = (node: FileNode) => {
    
    if (node.type === 'directory') {
      // Always allow folder selection when showFolders is true
      if (showFolders) {
        // Toggle folder selection
        const isSelected = selectedNodes.includes(node.path)
        if (isSelected) {
          // Remove folder and all its children
          const newSelection = selectedNodes.filter(path => 
            path !== node.path && !path.startsWith(node.path + '/')
          )
          onSelectionChange(newSelection)
        } else {
          // Add folder and all its children
          const childrenPaths = getAllChildPaths(node)
          const newSelection = [...selectedNodes, node.path, ...childrenPaths]
          onSelectionChange([...new Set(newSelection)]) // Remove duplicates
        }
      } else {
        // Just expand/collapse the directory
        toggleDirectory(node)
      }
    } else {
      // Toggle file selection
      const isSelected = selectedNodes.includes(node.path)
      if (isSelected) {
        onSelectionChange(selectedNodes.filter(path => path !== node.path))
      } else {
        onSelectionChange([...selectedNodes, node.path])
      }
    }
  }

  const getAllChildPaths = (node: FileNode): string[] => {
    const paths: string[] = []
    if (node.children) {
      node.children.forEach(child => {
        if (child.type === 'file') {
          paths.push(child.path)
        } else {
          paths.push(child.path)
          paths.push(...getAllChildPaths(child))
        }
      })
    }
    return paths
  }

  const isNodeSelected = (node: FileNode): boolean => {
    return selectedNodes.includes(node.path)
  }

  const isNodeIndeterminate = (node: FileNode): boolean => {
    if (node.type !== 'directory' || !node.children) return false
    
    const selectedChildren = node.children.filter(child => 
      child.type === 'file' ? selectedNodes.includes(child.path) : isNodeSelected(child)
    ).length
    
    return selectedChildren > 0 && selectedChildren < node.children.length
  }

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = isNodeSelected(node)
    const isIndeterminate = isNodeIndeterminate(node)
    const Icon = node.type === 'directory' ? Folder : FileText
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight
    


    return (
      <div key={node.id}>
        <div className="flex items-center group">
          <button
            onClick={() => handleNodeToggle(node)}
            className={clsx(
              'flex-1 flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground',
              'transition-colors'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {/* Checkbox or Chevron */}
            <div className="flex items-center justify-center w-4 h-4">
              {node.type === 'file' || (node.type === 'directory' && showFolders) ? (
                <div className={clsx(
                  'w-4 h-4 border rounded flex items-center justify-center',
                  isSelected ? 'bg-primary border-primary' : 'border-input',
                  isIndeterminate && 'bg-primary/50 border-primary'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  {isIndeterminate && !isSelected && <div className="w-2 h-0.5 bg-primary-foreground" />}
                </div>
              ) : (
                <ChevronIcon className="w-3 h-3 flex-shrink-0" />
              )}
            </div>
            
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => (
              <div key={child.path}>
                {renderNode(child, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  // Build filtered tree based on active filters
  const filteredTree: FileNode[] = useMemo(() => {
    const normalizeId = (s: string) => String(s || '').replace(/^node-/, '')
    const active = filters
    const usingFilters = (
      active.tags.length > 0 || active.nameKeyword || active.descriptionKeyword || active.startsWith || active.endsWith ||
      active.startDateFrom || active.startDateTo || active.dueDateFrom || active.dueDateTo || active.hasAttachments || active.linkedFromNodeTags.length > 0
    )
    if (!usingFilters) return fileTree

    // Precompute set of target IDs from linked-from sources
    const sourceIds = new Set<string>(active.linkedFromNodeTags.map(normalizeId).filter(Boolean))
    const outgoingTargetIds = new Set<string>()
    if (sourceIds.size > 0) {
      for (const n of nodeMap.values()) {
        const nid = n?.metadata?.id
        if (nid && sourceIds.has(String(nid))) {
          const links: string[] = Array.isArray(n?.metadata?.links) ? n.metadata.links : []
          links.forEach(id => { if (id) outgoingTargetIds.add(String(id)) })
        }
      }
    }

    const matches = (path: string, name: string): boolean => {
      // Get metadata for path
      const metaNode = nodeMap.get(path)
      const meta: any = metaNode?.metadata || {}

      // Title/name
      const title = String(meta?.title || name || '')
      // Description
      const description = String(meta?.description || '')
      // Tags
      const tags: string[] = Array.isArray(meta?.tags) ? meta.tags.map(String) : []
      // Dates
      const startDate = String(meta?.task?.startDate || '')
      const dueDate = String(meta?.task?.dueDate || '')
      // Attachments
      const files = Array.isArray(meta?.task?.files) ? meta.task.files : []
      // Node id
      const nodeId = String(meta?.id || '')

      // If metadata not available and filters require metadata, skip
      if (!metaNode && (active.tags.length>0 || active.nameKeyword || active.descriptionKeyword || active.startsWith || active.endsWith || active.startDateFrom || active.startDateTo || active.dueDateFrom || active.dueDateTo || active.hasAttachments || active.linkedFromNodeTags.length>0)) {
        return false
      }

      // name keyword (case-insensitive)
      if (active.nameKeyword) {
        const q = active.nameKeyword.toLowerCase()
        if (!title.toLowerCase().includes(q)) return false
      }

      // description keyword (case-insensitive)
      if (active.descriptionKeyword) {
        const q = active.descriptionKeyword.toLowerCase()
        if (!description.toLowerCase().includes(q)) return false
      }

      // starts/ends with on title with case sensitivity option
      if (active.startsWith) {
        if (active.startsEndsCaseSensitive) {
          if (!title.startsWith(active.startsWith)) return false
        } else {
          if (!title.toLowerCase().startsWith(active.startsWith.toLowerCase())) return false
        }
      }
      if (active.endsWith) {
        if (active.startsEndsCaseSensitive) {
          if (!title.endsWith(active.endsWith)) return false
        } else {
          if (!title.toLowerCase().endsWith(active.endsWith.toLowerCase())) return false
        }
      }

      // tags ANY/ALL
      if (active.tags.length > 0) {
        const set = new Set(tags.map(t=>t.toLowerCase()))
        const wanted = active.tags.map(t=>t.toLowerCase())
        if (active.tagsLogic === 'ANY') {
          if (!wanted.some(t => set.has(t))) return false
        } else {
          if (!wanted.every(t => set.has(t))) return false
        }
      }

      // date ranges (inclusive)
      if (active.startDateFrom && (!startDate || startDate < active.startDateFrom)) return false
      if (active.startDateTo && (!startDate || startDate > active.startDateTo)) return false
      if (active.dueDateFrom && (!dueDate || dueDate < active.dueDateFrom)) return false
      if (active.dueDateTo && (!dueDate || dueDate > active.dueDateTo)) return false

      // attachments
      if (active.hasAttachments) {
        if (!Array.isArray(files) || files.length === 0) return false
      }

      // linked-from sources: include only if this node's id is a target
      if (sourceIds.size > 0) {
        if (!nodeId || !outgoingTargetIds.has(nodeId)) return false
      }

      return true
    }

    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      const out: FileNode[] = []
      for (const n of nodes) {
        if (n.type === 'file') {
          if (matches(n.path, n.name)) out.push(n)
        } else if (n.children) {
          const kept = filterNodes(n.children)
          if (kept.length > 0) out.push({ ...n, children: kept })
        }
      }
      return out
    }

    return filterNodes(fileTree)
  }, [fileTree, filters, nodeMap])

  const updateFilters = (next: Partial<NodeFilterState>) => {
    const merged = { ...filters, ...next }
    onFiltersChange?.(merged)
  }

  const selectAll = () => {
    const allFilePaths = getAllFilePaths(fileTree)
    onSelectionChange(allFilePaths)
  }

  const clearSelection = () => {
    onSelectionChange([])
  }

  const getAllFilePaths = (nodes: FileNode[]): string[] => {
    const paths: string[] = []
    nodes.forEach(node => {
      if (node.type === 'file') {
        paths.push(node.path)
      } else if (node.children) {
        paths.push(...getAllFilePaths(node.children))
      }
    })
    return paths
  }

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">No Project Selected</h2>
          <p className="text-sm text-muted-foreground">
            Please select a project to choose files for compilation
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-muted/30 border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Select Files</h3>
          <p className="text-xs text-muted-foreground">
            {selectedNodes.length} files selected
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={selectAll}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent"
          >
            Select All
          </button>
          <button
            onClick={clearSelection}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Show Nodes Only Toggle */}
      <div className="p-2 border-b border-border flex items-center gap-2">
        <button
          onClick={() => setFiltersOpen(true)}
          className="text-xs px-2 py-1 border border-input rounded hover:bg-accent"
        >
          Filters
        </button>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showNodesOnly}
            onChange={(e) => setShowNodesOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs">Show Nodes Only</span>
        </label>
      </div>
      {/* Live filter summary */}
      {(() => {
        const parts: string[] = []
        if (filters.tags.length > 0) parts.push(`tags(${filters.tagsLogic}): ${filters.tags.join(', ')}`)
        if (filters.nameKeyword) parts.push(`name:"${filters.nameKeyword}"`)
        if (filters.descriptionKeyword) parts.push(`desc:"${filters.descriptionKeyword}"`)
        if (filters.startsWith) parts.push(`starts:${filters.startsWith}${filters.startsEndsCaseSensitive ? '' : ' (i)'}`)
        if (filters.endsWith) parts.push(`ends:${filters.endsWith}${filters.startsEndsCaseSensitive ? '' : ' (i)'}`)
        if (filters.startDateFrom || filters.startDateTo) parts.push(`start:${filters.startDateFrom || ''}..${filters.startDateTo || ''}`)
        if (filters.dueDateFrom || filters.dueDateTo) parts.push(`due:${filters.dueDateFrom || ''}..${filters.dueDateTo || ''}`)
        if (filters.hasAttachments) parts.push('attachments')
        if (filters.linkedFromNodeTags.length > 0) parts.push(`linkedFrom(${filters.linkedFromNodeTags.length})`)
        if (parts.length === 0) return null
        return (
          <div className="px-2 py-1 border-b border-border text-[11px] text-muted-foreground truncate" title={parts.join('  •  ')}>
            Active filters: {parts.join('  •  ')}
          </div>
        )
      })()}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No files</div>
        ) : (
          filteredTree.map(node => (
            <div key={node.path}>
              {renderNode(node)}
            </div>
          ))
        )}
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setFiltersOpen(false)}>
          <div className="bg-background border border-border rounded-lg w-[640px] max-w-[95vw] p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button className="px-2 py-1 text-xs border rounded" onClick={()=>{ onFiltersChange?.(DEFAULT_FILTERS); }}>Clear</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-2">
                <label className="block text-xs font-medium">Tags (comma-separated)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.tags.join(', ')} onChange={(e)=>updateFilters({ tags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} placeholder="e.g. design, api" />
                <label className="inline-flex items-center gap-2 text-xs mt-1">
                  <span>Match:</span>
                  <select className="px-2 py-1 border border-input rounded bg-background" value={filters.tagsLogic} onChange={(e)=>updateFilters({ tagsLogic: (e.target.value as any) })}>
                    <option value="ANY">ANY</option>
                    <option value="ALL">ALL</option>
                  </select>
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium">Keyword in name (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.nameKeyword} onChange={(e)=>updateFilters({ nameKeyword: e.target.value })} placeholder="case-insensitive" />
                <label className="block text-xs font-medium">Keyword in description</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.descriptionKeyword} onChange={(e)=>updateFilters({ descriptionKeyword: e.target.value })} placeholder="case-insensitive" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium">Starts with (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.startsWith} onChange={(e)=>updateFilters({ startsWith: e.target.value })} />
                <label className="block text-xs font-medium">Ends with (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.endsWith} onChange={(e)=>updateFilters({ endsWith: e.target.value })} />
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" checked={filters.startsEndsCaseSensitive} onChange={(e)=>updateFilters({ startsEndsCaseSensitive: e.target.checked })} />
                  Case sensitive
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium">Start date range (YYYY-MM-DD)</label>
                <div className="flex gap-2">
                  <input ref={startFromRef} type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={filters.startDateFrom || ''} onChange={(e)=>updateFilters({ startDateFrom: e.target.value || undefined })} onFocus={()=>{ try{ (startFromRef.current as any)?.showPicker?.() }catch{}}} onClick={()=>{ try{ (startFromRef.current as any)?.showPicker?.() }catch{}}} />
                  <input ref={startToRef} type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={filters.startDateTo || ''} onChange={(e)=>updateFilters({ startDateTo: e.target.value || undefined })} onFocus={()=>{ try{ (startToRef.current as any)?.showPicker?.() }catch{}}} onClick={()=>{ try{ (startToRef.current as any)?.showPicker?.() }catch{}}} />
                </div>
                <label className="block text-xs font-medium">Due date range (YYYY-MM-DD)</label>
                <div className="flex gap-2">
                  <input ref={dueFromRef} type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={filters.dueDateFrom || ''} onChange={(e)=>updateFilters({ dueDateFrom: e.target.value || undefined })} onFocus={()=>{ try{ (dueFromRef.current as any)?.showPicker?.() }catch{}}} onClick={()=>{ try{ (dueFromRef.current as any)?.showPicker?.() }catch{}}} />
                  <input ref={dueToRef} type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={filters.dueDateTo || ''} onChange={(e)=>updateFilters({ dueDateTo: e.target.value || undefined })} onFocus={()=>{ try{ (dueToRef.current as any)?.showPicker?.() }catch{}}} onClick={()=>{ try{ (dueToRef.current as any)?.showPicker?.() }catch{}}} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs mt-5">
                  <input type="checkbox" className="rounded" checked={filters.hasAttachments} onChange={(e)=>updateFilters({ hasAttachments: e.target.checked })} />
                  Has any file attachments
                </label>
              </div>

              <div className="space-y-2 col-span-2">
                <label className="block text-xs font-medium">Linked from node(s) (node ID tags, comma-separated)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={filters.linkedFromNodeTags.join(', ')} onChange={(e)=>updateFilters({ linkedFromNodeTags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} placeholder="e.g. node-123, node-456" />
                <p className="text-[10px] text-muted-foreground">Includes nodes that are targets of the outgoing links from the specified node(s).</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-1.5 border rounded" onClick={()=>setFiltersOpen(false)}>Cancel</button>
              <button className="px-3 py-1.5 border rounded bg-primary text-primary-foreground" onClick={()=>setFiltersOpen(false)}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NodeSelector 