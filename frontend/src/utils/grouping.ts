export type EquivalenceBox = {
  boxId: string
  nodeIds: string[]
  groupIds: string[]
}

export const sortIds = (ids: string[]): string[] => [...ids].map(String).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

export const setKeyFromIds = (ids: string[]): string => sortIds(ids).join('\x1f')

export const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids.map(String)))

export const buildEquivalenceBoxes = (groups: Array<{ groupId: string; nodeIds: string[] }>): EquivalenceBox[] => {
  const map = new Map<string, EquivalenceBox>()
  for (const { groupId, nodeIds } of groups) {
    const key = setKeyFromIds(uniqueIds(nodeIds))
    const existing = map.get(key)
    if (existing) {
      existing.groupIds.push(groupId)
    } else {
      map.set(key, {
        boxId: key,
        nodeIds: sortIds(uniqueIds(nodeIds)),
        groupIds: [groupId],
      })
    }
  }
  return Array.from(map.values())
}

export const isSubset = (a: string[], b: string[]): boolean => {
  // a ⊆ b
  if (a.length > b.length) return false
  const setB = new Set(b)
  for (const id of a) if (!setB.has(id)) return false
  return true
}

export type InclusionEdge = { parentBoxId: string; childBoxId: string }

// Compute Hasse diagram (cover relations) of set inclusion among equivalence boxes
export const computeCoverRelations = (boxes: EquivalenceBox[]): InclusionEdge[] => {
  // First, compute all inclusion edges parent -> child where parent.set ⊃ child.set
  const allEdges: InclusionEdge[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue
      const A = boxes[i]
      const B = boxes[j]
      if (A.nodeIds.length <= B.nodeIds.length) continue
      if (isSubset(B.nodeIds, A.nodeIds)) allEdges.push({ parentBoxId: A.boxId, childBoxId: B.boxId })
    }
  }

  // Transitive reduction: remove edges that are implied via intermediate nodes
  const byParent = new Map<string, Set<string>>()
  const childrenOf = (p: string) => byParent.get(p) || new Set<string>()
  for (const e of allEdges) {
    if (!byParent.has(e.parentBoxId)) byParent.set(e.parentBoxId, new Set())
    byParent.get(e.parentBoxId)!.add(e.childBoxId)
  }

  // Compute reachability via BFS for each parent
  const reachable = new Map<string, Set<string>>()
  const parents = Array.from(byParent.keys())
  for (const p of parents) {
    const seen = new Set<string>()
    const queue: string[] = [...(byParent.get(p) || [])]
    while (queue.length) {
      const c = queue.shift()!
      if (seen.has(c)) continue
      seen.add(c)
      const gc = byParent.get(c)
      if (gc) gc.forEach(x => queue.push(x))
    }
    reachable.set(p, seen)
  }

  // Remove direct edge p->c if there exists an intermediate k such that p->k and k->...->c
  const reduced: InclusionEdge[] = []
  for (const e of allEdges) {
    let implied = false
    // Check if there exists k != c with p->k and k reaches c
    const directChildren = Array.from(childrenOf(e.parentBoxId))
    for (const k of directChildren) {
      if (k === e.childBoxId) continue
      const reach = reachable.get(k)
      if (reach && reach.has(e.childBoxId)) { implied = true; break }
    }
    if (!implied) reduced.push(e)
  }

  return reduced
}

export const computeRemainder = (parent: string[], children: string[][]): string[] => {
  const parentSet = new Set(parent)
  for (const child of children) for (const id of child) parentSet.delete(id)
  return Array.from(parentSet)
}


