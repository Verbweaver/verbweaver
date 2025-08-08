import { useState, useEffect, useCallback } from 'react'
import { FileText, GripVertical, X, Check, ArrowUpDown, ArrowUp, ArrowDown, Shuffle, Calendar, Hash } from 'lucide-react'
import { useNodeStore } from '../store/nodeStore'
import { useCompilerStore } from '../store/compilerStore'
import { useThemeStore } from '../store/themeStore'
import clsx from 'clsx'

interface NodeOrderingPanelProps {
  selectedNodes: string[]
  onOrderChange: (orderedNodes: string[]) => void
  // Notify parent about removal so Select Files panel can be de-synced
  onRemoveNodes?: (removedPaths: string[]) => void
}

interface OrderedNode {
  path: string
  name: string
  title?: string
  isSelected?: boolean
}

type SortStrategy = 
  | 'sequential'
  | 'alphabetical'
  | 'reverse-alphabetical'
  | 'random'
  | 'date-modified'
  | 'file-size'
  | 'creation-date'

interface SortOption {
  id: SortStrategy
  name: string
  icon: any
  description: string
}

const sortOptions: SortOption[] = [
  {
    id: 'sequential',
    name: 'Sequential',
    icon: ArrowUpDown,
    description: 'Maintain original file tree order'
  },
  {
    id: 'alphabetical',
    name: 'Alphabetical',
    icon: ArrowUp,
    description: 'Sort by filename A-Z'
  },
  {
    id: 'reverse-alphabetical',
    name: 'Reverse Alphabetical',
    icon: ArrowDown,
    description: 'Sort by filename Z-A'
  },
  {
    id: 'random',
    name: 'Random',
    icon: Shuffle,
    description: 'Shuffle items randomly'
  },
  {
    id: 'date-modified',
    name: 'By Date Modified',
    icon: Calendar,
    description: 'Sort by last modified date'
  },
  {
    id: 'file-size',
    name: 'By File Size',
    icon: Hash,
    description: 'Sort by file size'
  }
]

function NodeOrderingPanel({ selectedNodes, onOrderChange, onRemoveNodes }: NodeOrderingPanelProps) {
  const { getNode } = useNodeStore()
  const { theme } = useThemeStore()
  const { 
    selectedNodeIndices, 
    lastClickedIndex, 
    setSelectedIndices, 
    setLastClickedIndex, 
    clearSelection 
  } = useCompilerStore()
  
  const [orderedNodes, setOrderedNodes] = useState<OrderedNode[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    // Auto-sort nodes by path and load their metadata
    const loadOrderedNodes = async () => {
      const sortedPaths = [...selectedNodes].sort()
      const nodes: OrderedNode[] = []

      for (const path of sortedPaths) {
        try {
          const node = await getNode(path)
          if (node) {
            nodes.push({
              path: node.path,
              name: node.name,
              title: node.metadata?.title || node.name,
              isSelected: false
            })
          } else {
            // Fallback if node not found
            nodes.push({
              path,
              name: path.split('/').pop() || path,
              title: path.split('/').pop() || path,
              isSelected: false
            })
          }
        } catch (error) {
          console.error('Failed to load node:', path, error)
          // Fallback
          nodes.push({
            path,
            name: path.split('/').pop() || path,
            title: path.split('/').pop() || path,
            isSelected: false
          })
        }
      }

      setOrderedNodes(nodes)
      clearSelection()
      onOrderChange(sortedPaths)
    }

    if (selectedNodes.length > 0) {
      loadOrderedNodes()
    } else {
      setOrderedNodes([])
      clearSelection()
      onOrderChange([])
    }
  }, [selectedNodes, getNode, onOrderChange, clearSelection])

  const handleNodeClick = useCallback((index: number, event: React.MouseEvent) => {
    const newSelectedIndices = new Set(selectedNodeIndices || [])
    
    if (event.ctrlKey || event.metaKey) {
      // CTRL+click: toggle individual selection
      if (newSelectedIndices.has(index)) {
        newSelectedIndices.delete(index)
      } else {
        newSelectedIndices.add(index)
      }
      setLastClickedIndex(index)
    } else if (event.shiftKey && lastClickedIndex !== null) {
      // SHIFT+click: range selection
      const start = Math.min(lastClickedIndex, index)
      const end = Math.max(lastClickedIndex, index)
      for (let i = start; i <= end; i++) {
        newSelectedIndices.add(i)
      }
    } else {
      // Regular click: select only this item
      newSelectedIndices.clear()
      newSelectedIndices.add(index)
      setLastClickedIndex(index)
    }
    
    setSelectedIndices(newSelectedIndices)
  }, [selectedNodeIndices, lastClickedIndex, setSelectedIndices, setLastClickedIndex])

  const handleCheckboxChange = useCallback((index: number, checked: boolean) => {
    const newSelectedIndices = new Set(selectedNodeIndices || [])
    
    if (checked) {
      newSelectedIndices.add(index)
    } else {
      newSelectedIndices.delete(index)
    }
    
    setSelectedIndices(newSelectedIndices)
    setLastClickedIndex(index)
  }, [selectedNodeIndices, setSelectedIndices, setLastClickedIndex])

  const selectAll = useCallback(() => {
    const newSelectedIndices = new Set<number>()
    for (let i = 0; i < orderedNodes.length; i++) {
      newSelectedIndices.add(i)
    }
    setSelectedIndices(newSelectedIndices)
  }, [orderedNodes.length])

  const deselectAll = useCallback(() => {
    setSelectedIndices(new Set())
    setLastClickedIndex(null)
  }, [])

  const sortAllNodes = useCallback((strategy: SortStrategy) => {
    const sortedNodes = sortNodesByStrategy(orderedNodes, strategy)
    setOrderedNodes(sortedNodes)
    onOrderChange(sortedNodes.map(node => node.path))
  }, [orderedNodes, onOrderChange])

  const sortSelectedNodes = useCallback((strategy: SortStrategy) => {
    if (!selectedNodeIndices || selectedNodeIndices.size === 0) {
      // If no selection, sort all nodes
      sortAllNodes(strategy)
      return
    }

    const selectedNodes = Array.from(selectedNodeIndices || []).map(index => orderedNodes[index])
    const unselectedNodes = orderedNodes.filter((_, index) => !selectedNodeIndices?.has(index))
    
    // Sort the selected nodes
    const sortedSelectedNodes = sortNodesByStrategy(selectedNodes, strategy)
    
    // Reconstruct the array with sorted selected nodes in their original positions
    const newOrderedNodes = [...orderedNodes]
    const selectedIndicesArray = Array.from(selectedNodeIndices || []).sort((a, b) => a - b)
    
    // Replace selected nodes with sorted versions
    for (let i = 0; i < selectedIndicesArray.length; i++) {
      newOrderedNodes[selectedIndicesArray[i]] = sortedSelectedNodes[i]
    }
    
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
  }, [orderedNodes, selectedNodeIndices, onOrderChange, sortAllNodes])

  const sortNodesByStrategy = useCallback((nodes: OrderedNode[], strategy: SortStrategy): OrderedNode[] => {
    const sortedNodes = [...nodes]
    
    switch (strategy) {
      case 'sequential':
        // Already in sequential order, no change needed
        return sortedNodes
        
      case 'alphabetical':
        return sortedNodes.sort((a, b) => a.name.localeCompare(b.name))
        
      case 'reverse-alphabetical':
        return sortedNodes.sort((a, b) => b.name.localeCompare(a.name))
        
      case 'random':
        return sortedNodes.sort(() => Math.random() - 0.5)
        
      case 'date-modified':
        // For now, fall back to alphabetical since we don't have file dates
        return sortedNodes.sort((a, b) => a.name.localeCompare(b.name))
        
      case 'file-size':
        // For now, fall back to alphabetical since we don't have file sizes
        return sortedNodes.sort((a, b) => a.name.localeCompare(b.name))
        
      default:
        return sortedNodes
    }
  }, [])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newOrderedNodes = [...orderedNodes]
    const draggedNode = newOrderedNodes[draggedIndex]
    
    // Remove from original position
    newOrderedNodes.splice(draggedIndex, 1)
    
    // Insert at new position
    newOrderedNodes.splice(dropIndex, 0, draggedNode)
    
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
    
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const removeNode = (index: number) => {
    const newOrderedNodes = orderedNodes.filter((_, i) => i !== index)
    const removed = [orderedNodes[index]?.path].filter(Boolean) as string[]
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
    onRemoveNodes?.(removed)
    
    // Update selection indices
    const newSelectedIndices = new Set<number>()
    selectedNodeIndices?.forEach(selectedIndex => {
      if (selectedIndex < index) {
        newSelectedIndices.add(selectedIndex)
      } else if (selectedIndex > index) {
        newSelectedIndices.add(selectedIndex - 1)
      }
    })
    setSelectedIndices(newSelectedIndices)
  }

  const removeSelectedNodes = useCallback(() => {
    const indicesToRemove = Array.from(selectedNodeIndices || []).sort((a, b) => b - a)
    let newOrderedNodes = [...orderedNodes]
    const removed: string[] = []
    
    for (const index of indicesToRemove) {
      const [spliced] = newOrderedNodes.splice(index, 1)
      if (spliced?.path) removed.push(spliced.path)
    }
    
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
    clearSelection()
    if (removed.length) onRemoveNodes?.(removed)
  }, [orderedNodes, selectedNodeIndices, onOrderChange, clearSelection])

  // Handle Delete key to remove selected
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Remove only if focus is within this panel (heuristic: body as fallback)
        removeSelectedNodes()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [removeSelectedNodes])

  const selectedCount = selectedNodeIndices?.size || 0
  const hasSelection = selectedCount > 0

  if (orderedNodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">No Files Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select files from the left panel to order them for compilation
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold">File Order</h3>
          <p className="text-sm text-muted-foreground">
            Drag to reorder • Files will be compiled in this order
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {orderedNodes.length} files
          {hasSelection && ` • ${selectedCount} selected`}
        </div>
      </div>

      {/* Selection Controls */}
      {orderedNodes.length > 0 && (
        <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30">
          <button
            onClick={selectAll}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent"
          >
            Deselect All
          </button>
                     {hasSelection && (
             <button
               onClick={removeSelectedNodes}
               className="text-xs px-2 py-1 border border-destructive bg-destructive text-destructive-foreground rounded hover:bg-destructive/80 transition-colors"
             >
               Remove Selected
             </button>
           )}
        </div>
      )}

      {/* Sort Controls */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">Sort:</span>
          {sortOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => sortSelectedNodes(option.id)}
              className={clsx(
                "text-xs px-2 py-1 border rounded hover:bg-accent flex items-center gap-1 transition-colors",
                hasSelection && "bg-primary text-primary-foreground border-primary shadow-sm"
              )}
              title={option.description}
            >
              <option.icon className="w-3 h-3" />
              {hasSelection ? `${option.name} (${selectedCount})` : option.name}
            </button>
          ))}
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {orderedNodes.map((node, index) => (
          <div
            key={node.path}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onClick={(e) => handleNodeClick(index, e)}
                          className={clsx(
                'flex items-center gap-3 p-3 border-b border-border transition-colors cursor-pointer',
                'hover:bg-accent/50',
                selectedNodeIndices?.has(index) && 'bg-primary/10 border-primary/20',
                draggedIndex === index && 'opacity-50',
                dragOverIndex === index && 'bg-accent/30'
              )}
          >
            {/* Checkbox */}
            <div className="flex-shrink-0">
              <input
                type="checkbox"
                checked={selectedNodeIndices?.has(index) || false}
                onChange={(e) => handleCheckboxChange(index, e.target.checked)}
                className="rounded"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Drag Handle */}
            <div className="flex-shrink-0">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>

            {/* File Icon */}
            <div className="flex-shrink-0">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {node.title}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {node.path}
              </div>
            </div>

            {/* Order Number */}
            <div className="flex-shrink-0">
              <span className="text-xs text-muted-foreground">
                {index + 1}
              </span>
            </div>

            {/* Remove Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeNode(index)
              }}
              className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Remove from compilation"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default NodeOrderingPanel 