import dagre from 'dagre'
import { Node, Edge } from '@xyflow/react'

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

// Folder lines ("contains") are built in Graph.tsx with ids `hard-<parent>-<child>`; soft links use `soft_`.
// Match on the id, not the line colour, which follows the theme (#160)
function isHardEdge(edge: Edge): boolean {
  return edge.id.startsWith('hard-')
}

function isFolderNode(node: Node): boolean {
  const data = node.data as { isDirectory?: boolean; type?: string } | undefined
  return !!data?.isDirectory || data?.type === 'folder'
}

function compareChildren(a: Node, b: Node): number {
  const aIsFolder = isFolderNode(a)
  const bIsFolder = isFolderNode(b)
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
  return String(a.data?.label || '').localeCompare(String(b.data?.label || ''))
}

interface LayoutTree {
  node: Node
  children: LayoutTree[]
  height: number // vertical space the subtree needs
}

// Rendered box size, with the same fallback as getLayoutedElements before React Flow has measured it
function sizeOf(node: Node): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 150,
    height: node.measured?.height ?? node.height ?? 50,
  }
}

// Expanded layout: a sideways mind map. Each top-level item sits at the centre of its own tree,
// its contents alternate to the right and left, and every deeper level sits further out.
// Each branch gets as much vertical room as its contents need, so boxes never overlap.
export function getExpandedLayout(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const columnGap = 100 // horizontal gap between a column and the next level out
  const rowGap = 24 // vertical gap between neighbouring boxes in a column
  const treeGap = 120 // vertical gap between separate top-level trees

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const childrenMap = new Map<string, Node[]>()
  const hasParent = new Set<string>()
  edges.forEach(edge => {
    if (!isHardEdge(edge) || edge.source === edge.target) return
    const child = nodeMap.get(edge.target)
    if (!child || !nodeMap.has(edge.source) || hasParent.has(child.id)) return
    hasParent.add(child.id)
    const children = childrenMap.get(edge.source) || []
    children.push(child)
    childrenMap.set(edge.source, children)
  })

  function stackHeight(trees: LayoutTree[]): number {
    if (trees.length === 0) return 0
    return trees.reduce((sum, t) => sum + t.height, 0) + rowGap * (trees.length - 1)
  }

  // Place each node once, even if the folder lines contain a loop
  const visited = new Set<string>()
  function buildTree(node: Node): LayoutTree {
    visited.add(node.id)
    const children = (childrenMap.get(node.id) || [])
      .filter(c => !visited.has(c.id))
      .sort(compareChildren)
      .map(buildTree)
    return { node, children, height: Math.max(sizeOf(node).height, stackHeight(children)) }
  }

  // Widest box at each level of one side of a tree, so each level forms a tidy column
  function columnWidths(trees: LayoutTree[], depth = 0, widths: number[] = []): number[] {
    trees.forEach(t => {
      widths[depth] = Math.max(widths[depth] ?? 0, sizeOf(t.node).width)
      columnWidths(t.children, depth + 1, widths)
    })
    return widths
  }

  const positions = new Map<string, { x: number; y: number }>()

  // Stack trees in one column, centred on centerY, then place their children one column further out.
  // edgeX is the column's inner edge: its left edge on the right side, its right edge on the left side.
  function placeColumn(trees: LayoutTree[], edgeX: number, centerY: number, direction: 1 | -1, widths: number[], depth: number) {
    if (trees.length === 0) return
    const nextEdgeX = edgeX + direction * (widths[depth] + columnGap)
    let top = centerY - stackHeight(trees) / 2
    trees.forEach(t => {
      const { width, height } = sizeOf(t.node)
      const childCenter = top + t.height / 2
      positions.set(t.node.id, { x: direction === 1 ? edgeX : edgeX - width, y: childCenter - height / 2 })
      placeColumn(t.children, nextEdgeX, childCenter, direction, widths, depth + 1)
      top += t.height + rowGap
    })
  }

  // Top-level items: nodes with no folder line coming in, with the project's 'nodes' folder first.
  // Any node left over afterwards (only possible inside a loop) starts its own tree.
  const roots = nodes.filter(n => !hasParent.has(n.id))
  roots.sort((a, b) => (a.id === 'nodes' ? -1 : b.id === 'nodes' ? 1 : 0))
  const startOrder = [...roots, ...nodes.filter(n => hasParent.has(n.id))]

  let nextTop: number | null = null
  startOrder.forEach(rootNode => {
    if (visited.has(rootNode.id)) return
    const tree = buildTree(rootNode)
    const right = tree.children.filter((_, i) => i % 2 === 0)
    const left = tree.children.filter((_, i) => i % 2 === 1)
    const root = sizeOf(rootNode)
    const halfHeight = Math.max(root.height, stackHeight(right), stackHeight(left)) / 2
    // The first tree's root sits at (0, 0); later trees go below the previous one
    const centerY = nextTop === null ? root.height / 2 : nextTop + halfHeight
    positions.set(rootNode.id, { x: 0, y: centerY - root.height / 2 })
    placeColumn(right, root.width + columnGap, centerY, 1, columnWidths(right), 0)
    placeColumn(left, -columnGap, centerY, -1, columnWidths(left), 0)
    nextTop = centerY + halfHeight + treeGap
  })

  const layoutedNodes = nodes.map(node => ({ ...node, position: positions.get(node.id) || node.position }))
  return { nodes: layoutedNodes, edges }
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