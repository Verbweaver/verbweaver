import { useState, useEffect } from 'react'
import { FileText, GripVertical, X } from 'lucide-react'
import { useNodeStore } from '../store/nodeStore'
import clsx from 'clsx'

interface NodeOrderingPanelProps {
  selectedNodes: string[]
  onOrderChange: (orderedNodes: string[]) => void
}

interface OrderedNode {
  path: string
  name: string
  title?: string
}

function NodeOrderingPanel({ selectedNodes, onOrderChange }: NodeOrderingPanelProps) {
  const { getNode } = useNodeStore()
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
              title: node.metadata?.title || node.name
            })
          } else {
            // Fallback if node not found
            nodes.push({
              path,
              name: path.split('/').pop() || path,
              title: path.split('/').pop() || path
            })
          }
        } catch (error) {
          console.error('Failed to load node:', path, error)
          // Fallback
          nodes.push({
            path,
            name: path.split('/').pop() || path,
            title: path.split('/').pop() || path
          })
        }
      }

      setOrderedNodes(nodes)
      onOrderChange(sortedPaths)
    }

    if (selectedNodes.length > 0) {
      loadOrderedNodes()
    } else {
      setOrderedNodes([])
      onOrderChange([])
    }
  }, [selectedNodes, getNode, onOrderChange])

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
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
  }

  const moveNode = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    
    const newOrderedNodes = [...orderedNodes]
    const [movedNode] = newOrderedNodes.splice(fromIndex, 1)
    newOrderedNodes.splice(toIndex, 0, movedNode)
    
    setOrderedNodes(newOrderedNodes)
    onOrderChange(newOrderedNodes.map(node => node.path))
  }

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
            className={clsx(
              'flex items-center gap-3 p-3 border-b border-border transition-colors',
              'hover:bg-accent/50 cursor-move',
              draggedIndex === index && 'opacity-50',
              dragOverIndex === index && 'bg-accent/30'
            )}
          >
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
              onClick={() => removeNode(index)}
              className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Remove from compilation"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <button
            onClick={() => {
              // Move first item to end
              if (orderedNodes.length > 1) {
                moveNode(0, orderedNodes.length - 1)
              }
            }}
            disabled={orderedNodes.length <= 1}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent disabled:opacity-50"
          >
            Move First to End
          </button>
          <button
            onClick={() => {
              // Move last item to beginning
              if (orderedNodes.length > 1) {
                moveNode(orderedNodes.length - 1, 0)
              }
            }}
            disabled={orderedNodes.length <= 1}
            className="text-xs px-2 py-1 border border-input rounded hover:bg-accent disabled:opacity-50"
          >
            Move Last to Start
          </button>
        </div>
      </div>
    </div>
  )
}

export default NodeOrderingPanel 