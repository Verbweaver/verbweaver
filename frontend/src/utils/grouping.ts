import { DEFAULT_FILTERS } from '../components/NodeFiltersDialog'
import { isExcludeFilter, hasActivePaths } from './nodeFilters'
import type { GroupDefinition } from '../store/groupViewState'

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

// The parts of a page that tag grouping reads
type TaggedPage = { isDirectory?: boolean; metadata?: { tags?: unknown } }

// Tags a page carries, read from its metadata
const pageTags = (node: TaggedPage): string[] =>
  Array.isArray(node?.metadata?.tags) ? node.metadata.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : []

// A group made by "By tag" holds exactly one filter for exactly one tag
const singleTagOf = (group: GroupDefinition): string | null => {
  if (group.filters.length !== 1) return null
  const f = group.filters[0]
  if (isExcludeFilter(f) || hasActivePaths(f)) return null
  const tags = f.tags || []
  if (tags.length !== 1) return null
  const onlyTags = !f.nameKeyword && !f.descriptionKeyword && !f.startsWith && !f.endsWith &&
    !f.startDateFrom && !f.startDateTo && !f.dueDateFrom && !f.dueDateTo && !f.hasAttachments &&
    (f.linkedFromNodeTags || []).length === 0
  return onlyTags ? tags[0].toLowerCase() : null
}

// Makes one group per tag used by any page, skipping tags that already have one (#37).
// Stops at maxGroups in total; `skipped` counts tags that didn't fit.
export const buildTagGroups = (
  nodes: Iterable<TaggedPage>,
  existingGroups: GroupDefinition[],
  maxGroups: number,
  genId: () => string,
): { added: GroupDefinition[]; skipped: number; totalTags: number } => {
  const byKey = new Map<string, string>()
  for (const n of nodes) {
    if (n?.isDirectory) continue
    for (const tag of pageTags(n)) {
      const key = tag.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, tag)
    }
  }
  const covered = new Set(existingGroups.map(singleTagOf).filter((t): t is string => !!t))
  const wanted = Array.from(byKey.entries())
    .filter(([key]) => !covered.has(key))
    .map(([, tag]) => tag)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const room = Math.max(0, maxGroups - existingGroups.length)
  const added = wanted.slice(0, room).map(tag => ({
    id: genId(),
    name: tag,
    enabled: true,
    filters: [{ ...DEFAULT_FILTERS, tags: [tag] }],
  }))
  return { added, skipped: wanted.length - added.length, totalTags: byKey.size }
}
