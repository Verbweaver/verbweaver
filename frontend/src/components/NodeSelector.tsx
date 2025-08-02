import { useEffect, useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, Check, CheckSquare } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { editorApi } from '../api/editorApi'
import clsx from 'clsx'

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
}

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

function NodeSelector({ selectedNodes, onSelectionChange, showFolders = false }: NodeSelectorProps) {
  const { currentProject, currentProjectPath } = useProjectStore()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showNodesOnly, setShowNodesOnly] = useState(true)

  useEffect(() => {
    if (currentProject) {
      loadFileTree()
    }
  }, [currentProject, currentProjectPath, showNodesOnly])

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
        // Use web API
        const response = await editorApi.getFileTree()
        let files = response.data
        
        // Filter to only show nodes directory if showNodesOnly is true
        if (showNodesOnly) {
          files = files.filter((file: any) => {
            // Include the nodes directory itself
            if (file.path === 'nodes') return true
            // Include all files and subdirectories within nodes
            if (file.path.startsWith('nodes/')) return true
            return false
          })
        }
        
        setFileTree(files)
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

    // Create nodes
    files.forEach(file => {
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
        // For web API, we'll need to implement this differently
        console.warn('Directory loading not implemented for web API')
        node.children = []
        node.loaded = true
        setFileTree([...fileTree]) // Trigger re-render
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
      <div className="p-2 border-b border-border">
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

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No files</div>
        ) : (
          fileTree.map(node => (
            <div key={node.path}>
              {renderNode(node)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default NodeSelector 