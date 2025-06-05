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

// Helper to determine which handles to use based on relative positions and layout type
function getHandleIds(
  sourcePos: { x: number; y: number }, 
  targetPos: { x: number; y: number },
  sourceNode: Node,
  targetNode: Node,
  layoutType: string = 'default'
) {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (layoutType === 'expanded') {
    // For Expanded layout, always use horizontal handles
    if (dx > 0) {
      return { sourceHandle: 'right', targetHandle: 'left' };
    } else {
      // Default to left-to-right if dx is 0 or negative, to prevent issues with overlapping nodes
      return { sourceHandle: 'left', targetHandle: 'right' }; 
    }
  }
  
  // For all other layouts, use vertical handles as default
  if (Math.abs(dy) >= Math.abs(dx)) { // Prefer vertical if similar delta
    if (dy > 0) {
      return { sourceHandle: 'bottom', targetHandle: 'top' };
    } else {
      return { sourceHandle: 'top', targetHandle: 'bottom' };
    }
  } else { // Horizontal fallback for non-expanded if dx is significantly larger
     if (dx > 0) {
      return { sourceHandle: 'right', targetHandle: 'left' };
    } else {
      return { sourceHandle: 'left', targetHandle: 'right' };
    }
  }
}

// Expanded layout that alternates folders left and right
export function getExpandedLayout(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenMap = new Map<string, Node[]>();
  const parentMap = new Map<string, string>(); // To find parent of a node

  edges.forEach(edge => {
    if (edge.style?.stroke === '#6b7280') { // Hard links (parent-child)
      const children = childrenMap.get(edge.source) || [];
      const childNode = nodeMap.get(edge.target);
      if (childNode) {
        children.push(childNode);
        childrenMap.set(edge.source, children);
        parentMap.set(edge.target, edge.source);
      }
    }
  });
  
  const rootNodes = nodes.filter(node => 
    node.id === 'nodes' || 
    !edges.some(edge => edge.target === node.id && edge.style?.stroke === '#6b7280')
  );
  
  const layoutedNodes: Node[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();
  const verticalSpacing = 80; // Reduced vertical spacing for a more compact horizontal layout
  const horizontalSpacing = 250; // Increased horizontal spacing
  let currentY = 50;
  const laidOutHorizontally = new Set<string>(); // Track nodes already part of horizontal chain

  function layoutNode(node: Node, x: number, y: number, level: number, isLeftChild?: boolean) {
    const position = { x, y }; 
    layoutedNodes.push({ ...node, position });
    nodePositions.set(node.id, position);
    laidOutHorizontally.add(node.id);

    const children = (childrenMap.get(node.id) || []).sort((a, b) => {
      const aIsFolder = a.data?.isDirectory || a.data?.type === 'folder';
      const bIsFolder = b.data?.isDirectory || b.data?.type === 'folder';
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return (a.data?.label || '').localeCompare(b.data?.label || '');
    });

    let childX;
    let childY = y; // Keep children at the same Y level initially
    let childrenOnLevel = 0;

    // Group children by whether they are folders or files for separate horizontal layout passes
    const folderChildren = children.filter(c => c.data?.isDirectory || c.data?.type === 'folder');
    const fileChildren = children.filter(c => !(c.data?.isDirectory || c.data?.type === 'folder'));

    // Layout folder children horizontally first
    folderChildren.forEach((child, index) => {
      if (laidOutHorizontally.has(child.id)) return; // Already processed
      // Alternate left and right from the parent
      if (index % 2 === 0) { // Place to the right
        childX = x + horizontalSpacing * (Math.floor(index / 2) + 1);
      } else { // Place to the left
        childX = x - horizontalSpacing * (Math.floor(index / 2) + 1);
      }
      layoutNode(child, childX, childY, level + 1, childX < x);
      childrenOnLevel++;
    });
    
    // Layout file children horizontally after folders, slightly offset vertically if needed
    if (folderChildren.length > 0 && fileChildren.length > 0) {
        childY += verticalSpacing; // Move files down a bit if folders are present on the same line
    }
    
    fileChildren.forEach((child, index) => {
        if (laidOutHorizontally.has(child.id)) return;
        // Alternate left and right from the parent
        if (index % 2 === 0) { // Place to the right
            childX = x + horizontalSpacing * (Math.floor(index / 2) + 1);
        } else { // Place to the left
            childX = x - horizontalSpacing * (Math.floor(index / 2) + 1);
        }
        layoutNode(child, childX, childY, level + 1, childX < x);
        childrenOnLevel++;
    });

    // If this node itself was a child and had its own children, adjust its parent's Y if needed to avoid overlap
    if (level > 0 && childrenOnLevel > 0 && nodePositions.has(parentMap.get(node.id)!)) {
        const parentNode = nodeMap.get(parentMap.get(node.id)!);
        if (parentNode) {
            const parentPos = nodePositions.get(parentNode.id)!;
            // This logic is complex and might need refinement for deep trees.
            // For now, simple Y shift to demonstrate intent.
            // if (isLeftChild && parentPos.y === y) parentPos.y -= verticalSpacing / 2;
            // if (!isLeftChild && parentPos.y === y) parentPos.y -= verticalSpacing / 2;
        }
    }
  }
  
  rootNodes.forEach((rootNode) => {
    if (!laidOutHorizontally.has(rootNode.id)){
        layoutNode(rootNode, 0, currentY, 0);
        currentY += verticalSpacing * 3; // Space out different root branches significantly
    }
  });
  
  const finalNodes = nodes.map(node => {
    const layoutedNode = layoutedNodes.find(n => n.id === node.id);
    return layoutedNode || { ...node, position: { x: Math.random() * 200, y: Math.random() * 200 } }; // Fallback position
  });
  
  const updatedEdges = edges.map(edge => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);
    
    if (sourceNode && targetNode && sourcePos && targetPos) {
      const { sourceHandle, targetHandle } = getHandleIds(sourcePos, targetPos, sourceNode, targetNode, 'expanded');
      return { ...edge, sourceHandle, targetHandle };
    }
    return { ...edge }; // Return original edge if nodes/positions not found
  });
  
  return { nodes: finalNodes, edges: updatedEdges };
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