// Shared helpers for soft links between nodes.

/** Minimal node shape needed to resolve soft links (structural, so local node types fit). */
export interface LinkableNode {
  path: string
  name: string
  isDirectory: boolean
  softLinks?: string[]
  metadata?: { id?: string; title?: string } | null
}

/**
 * Resolve a node's soft links (metadata ids in `softLinks`) to the linked, non-directory
 * nodes, de-duplicated by path and sorted by title.
 */
export function getLinkedNodes<T extends LinkableNode>(
  source: T | null | undefined,
  nodes: Map<string, T>
): T[] {
  const linkIds = Array.isArray(source?.softLinks) ? source!.softLinks : []
  if (linkIds.length === 0) return []
  const ids = new Set(linkIds.map(String))
  const byPath = new Map<string, T>()
  for (const other of nodes.values()) {
    const id = other.metadata?.id
    if (!other.isDirectory && id && ids.has(String(id))) byPath.set(other.path, other)
  }
  const title = (n: T) => n.metadata?.title || n.name
  return Array.from(byPath.values()).sort((a, b) => title(a).localeCompare(title(b)))
}
