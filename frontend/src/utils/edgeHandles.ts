export type XY = { x: number; y: number }

/**
 * Pick the CustomNode handle IDs that face each other for an edge between two nodes,
 * using the dominant axis of the offset between their positions (same rule as the Graph view).
 * Hard-coding right->left makes a link to a node on the left loop out past both nodes.
 */
export function chooseHandleIds(source: XY, target: XY): { sourceHandle: string; targetHandle: string } {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0
      ? { sourceHandle: 'bottom-source', targetHandle: 'top-target' }
      : { sourceHandle: 'top-source', targetHandle: 'bottom-target' }
  }
  return dx > 0
    ? { sourceHandle: 'right-source', targetHandle: 'left-target' }
    : { sourceHandle: 'left-source', targetHandle: 'right-target' }
}
