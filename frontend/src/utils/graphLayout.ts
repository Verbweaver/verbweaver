import dagre from 'dagre'
import { Node, Edge } from 'react-flow-renderer'

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL'

interface LayoutOptions {
  direction?: LayoutDirection
  nodeSpacing?: number
  rankSpacing?: number
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const {
    direction = 'TB',
    nodeSpacing = 100,
    rankSpacing = 150
  } = options

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // Set graph options based on direction
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSpacing,
    ranksep: rankSpacing,
    marginx: 50,
    marginy: 50
  })

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: 150, 
      height: 50 
    })
  })

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Calculate layout
  dagre.layout(dagreGraph)

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2
      }
    }
  })

  return { nodes: layoutedNodes, edges }
}

// Helper to determine which handles to use based on relative positions
function getHandleIds(sourcePos: { x: number; y: number }, targetPos: { x: number; y: number }) {
  const dx = targetPos.x - sourcePos.x
  const dy = targetPos.y - sourcePos.y
  
  // Determine primary direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      return { sourceHandle: 'right', targetHandle: 'left' }
    } else {
      return { sourceHandle: 'left', targetHandle: 'right' }
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      return { sourceHandle: 'bottom', targetHandle: 'top' }
    } else {
      return { sourceHandle: 'top', targetHandle: 'bottom' }
    }
  }
}

// Expanded layout that alternates folders left and right
export function getExpandedLayout(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  // Build a graph structure
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const childrenMap = new Map<string, Node[]>()
  
  // Find parent-child relationships
  edges.forEach(edge => {
    if (edge.style?.stroke === '#6b7280') { // Hard links (parent-child)
      const children = childrenMap.get(edge.source) || []
      const childNode = nodeMap.get(edge.target)
      if (childNode) {
        children.push(childNode)
        childrenMap.set(edge.source, children)
      }
    }
  })
  
  // Find root nodes
  const rootNodes = nodes.filter(node => 
    node.id === 'nodes' || 
    !edges.some(edge => edge.target === node.id && edge.style?.stroke === '#6b7280')
  )
  
  const layoutedNodes: Node[] = []
  const nodePositions = new Map<string, { x: number; y: number }>()
  const verticalSpacing = 100
  const horizontalSpacing = 200
  let currentY = 50
  
  // Layout function that alternates children left and right
  function layoutNode(node: Node, x: number, y: number, level: number) {
    // Position the current node
    const position = { x, y }
    layoutedNodes.push({
      ...node,
      position
    })
    nodePositions.set(node.id, position)
    
    // Get children
    const children = childrenMap.get(node.id) || []
    
    if (children.length > 0) {
      // Sort children - folders first, then by name
      const sortedChildren = children.sort((a, b) => {
        const aIsFolder = a.data?.isDirectory || a.data?.type === 'folder'
        const bIsFolder = b.data?.isDirectory || b.data?.type === 'folder'
        if (aIsFolder && !bIsFolder) return -1
        if (!aIsFolder && bIsFolder) return 1
        return (a.data?.label || '').localeCompare(b.data?.label || '')
      })
      
      // For folders at the nodes level, alternate left and right
      if (node.id === 'nodes') {
        let leftX = x - horizontalSpacing
        let rightX = x + horizontalSpacing
        let childY = y + verticalSpacing
        
        sortedChildren.forEach((child, index) => {
          const isFolder = child.data?.isDirectory || child.data?.type === 'folder'
          if (isFolder) {
            // Alternate folders left and right
            if (index % 2 === 0) {
              layoutNode(child, leftX, childY, level + 1)
              leftX -= horizontalSpacing * 1.5
            } else {
              layoutNode(child, rightX, childY, level + 1)
              rightX += horizontalSpacing * 1.5
            }
          } else {
            // Non-folders go below center
            layoutNode(child, x, childY + (index * 60), level + 1)
          }
        })
      } else {
        // For other nodes, use standard vertical layout
        let childY = y + verticalSpacing
        sortedChildren.forEach((child, index) => {
          layoutNode(child, x, childY + (index * 80), level + 1)
        })
      }
    }
  }
  
  // Layout each root node
  rootNodes.forEach((rootNode, index) => {
    layoutNode(rootNode, 400, currentY + (index * 200), 0)
  })
  
  // Return nodes that were actually laid out
  const layoutedNodeIds = new Set(layoutedNodes.map(n => n.id))
  const finalNodes = nodes.map(node => {
    const layoutedNode = layoutedNodes.find(n => n.id === node.id)
    return layoutedNode || node
  })
  
  // Update edges with appropriate handle IDs based on node positions
  const updatedEdges = edges.map(edge => {
    const sourcePos = nodePositions.get(edge.source)
    const targetPos = nodePositions.get(edge.target)
    
    if (sourcePos && targetPos) {
      const { sourceHandle, targetHandle } = getHandleIds(sourcePos, targetPos)
      return {
        ...edge,
        sourceHandle,
        targetHandle
      }
    }
    
    return edge
  })
  
  return { nodes: finalNodes, edges: updatedEdges }
}

// Helper to get a centered layout
export function getCenteredLayout(
  nodes: Node[],
  edges: Edge[],
  viewportWidth: number,
  viewportHeight: number,
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, options)
  
  // Find bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  
  layoutedNodes.forEach(node => {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + 150) // node width
    maxY = Math.max(maxY, node.position.y + 50)  // node height
  })
  
  // Calculate center offset
  const graphWidth = maxX - minX
  const graphHeight = maxY - minY
  const offsetX = (viewportWidth - graphWidth) / 2 - minX
  const offsetY = (viewportHeight - graphHeight) / 2 - minY
  
  // Apply offset to center the graph
  const centeredNodes = layoutedNodes.map(node => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY
    }
  }))
  
  return { nodes: centeredNodes, edges: layoutedEdges }
} 