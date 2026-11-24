import type { NodeFilterState } from '../components/NodeFiltersDialog'

// Matching rules for the Filters dialog, shared by the Graph, Group view,
// Compiler (NodeSelector) and Progression chart so they can't drift apart (#34)

type FilterLike = Partial<NodeFilterState>

// The parts of a page that the filters read
type PageMetadata = {
  id?: unknown
  title?: unknown
  description?: unknown
  tags?: unknown
  links?: unknown
  task?: { startDate?: unknown; dueDate?: unknown; files?: unknown } | null
}
export type FilterablePage = {
  path?: string
  name?: string
  metadata?: PageMetadata | null
}

const normalizeSlashes = (p: string) => String(p || '').replace(/\\/g, '/')

// Lowercase, forward slashes, no leading/trailing slashes
const normalizePathPrefix = (p: string) => normalizeSlashes(p).trim().replace(/^\/+|\/+$/g, '').toLowerCase()

// Split a comma-separated list typed into the dialog
export const parseList = (text: string): string[] => String(text || '').split(',').map(s => s.trim()).filter(Boolean)

const activePaths = (f: FilterLike): string[] => (f.paths || []).map(normalizePathPrefix).filter(Boolean)

// A page matches if its path starts with any of the prefixes. The leading `nodes/` is
// optional, so `characters` and `nodes/characters` both match `nodes/characters/alice.md`.
export const pathMatches = (pagePath: string, prefixes: string[]): boolean => {
  const wanted = prefixes.map(normalizePathPrefix).filter(Boolean)
  if (wanted.length === 0) return true
  const p = normalizeSlashes(pagePath).replace(/^\/+/, '').toLowerCase()
  const underNodes = p.startsWith('nodes/') ? p.slice('nodes/'.length) : null
  return wanted.some(w => p.startsWith(w) || (underNodes !== null && underNodes.startsWith(w)))
}

// True if any field narrows the pages
export const isFilterActive = (f: FilterLike | null | undefined): boolean => !!f && !!(
  (f.tags || []).length > 0 || f.nameKeyword || f.descriptionKeyword || f.startsWith || f.endsWith ||
  f.startDateFrom || f.startDateTo || f.dueDateFrom || f.dueDateTo || f.hasAttachments ||
  (f.linkedFromNodeTags || []).length > 0 || activePaths(f).length > 0
)

// True if an active field reads the page's metadata (everything except the path)
export const needsMetadata = (f: FilterLike): boolean => isFilterActive({ ...f, paths: [] })

const normalizeId = (s: string) => String(s || '').replace(/^node-/, '')

// Ids of the pages linked from the "Linked from" pages, or null when that field is empty.
// Compute once per filter run and pass to matchesNodeFilters.
export const buildLinkedTargets = (f: FilterLike, pages: Iterable<FilterablePage>): Set<string> | null => {
  const sourceIds = new Set<string>((f.linkedFromNodeTags || []).map(normalizeId).filter(Boolean))
  if (sourceIds.size === 0) return null
  const targets = new Set<string>()
  for (const n of pages) {
    const nid = n?.metadata?.id
    if (nid && sourceIds.has(String(nid))) {
      const links: unknown[] = Array.isArray(n.metadata?.links) ? n.metadata.links : []
      links.forEach(id => { if (id) targets.add(String(id)) })
    }
  }
  return targets
}

// Does a page pass every active field? `linkedTargets` comes from buildLinkedTargets.
export const matchesNodeFilters = (page: FilterablePage, f: FilterLike, linkedTargets: Set<string> | null): boolean => {
  const meta: PageMetadata = page?.metadata || {}
  const title = String(meta?.title || page?.name || '')
  const description = String(meta?.description || '')
  const tags: string[] = Array.isArray(meta?.tags) ? meta.tags.map(String) : []
  const startDate = String(meta?.task?.startDate || '')
  const dueDate = String(meta?.task?.dueDate || '')
  const files: unknown[] = Array.isArray(meta?.task?.files) ? meta.task.files : []
  const nodeId = String(meta?.id || '')

  const paths = activePaths(f)
  if (paths.length > 0 && !pathMatches(String(page?.path || ''), paths)) return false

  // keywords (case-insensitive)
  if (f.nameKeyword && !title.toLowerCase().includes(f.nameKeyword.toLowerCase())) return false
  if (f.descriptionKeyword && !description.toLowerCase().includes(f.descriptionKeyword.toLowerCase())) return false

  // starts/ends with on the title, with the case-sensitivity option
  if (f.startsWith) {
    if (f.startsEndsCaseSensitive) {
      if (!title.startsWith(f.startsWith)) return false
    } else if (!title.toLowerCase().startsWith(f.startsWith.toLowerCase())) return false
  }
  if (f.endsWith) {
    if (f.startsEndsCaseSensitive) {
      if (!title.endsWith(f.endsWith)) return false
    } else if (!title.toLowerCase().endsWith(f.endsWith.toLowerCase())) return false
  }

  // tags ANY/ALL
  if ((f.tags || []).length > 0) {
    const have = new Set(tags.map(t => t.toLowerCase()))
    const wanted = (f.tags || []).map(t => t.toLowerCase())
    if (f.tagsLogic === 'ALL') {
      if (!wanted.every(t => have.has(t))) return false
    } else if (!wanted.some(t => have.has(t))) return false
  }

  // date ranges (inclusive)
  if (f.startDateFrom && (!startDate || startDate < f.startDateFrom)) return false
  if (f.startDateTo && (!startDate || startDate > f.startDateTo)) return false
  if (f.dueDateFrom && (!dueDate || dueDate < f.dueDateFrom)) return false
  if (f.dueDateTo && (!dueDate || dueDate > f.dueDateTo)) return false

  if (f.hasAttachments && files.length === 0) return false

  // linked-from sources: include only if this page's id is a target
  if (linkedTargets && (!nodeId || !linkedTargets.has(nodeId))) return false

  return true
}

// Short text for the filter chip, or null when nothing is filtered
export const summarizeFilters = (f: FilterLike | null | undefined): string | null => {
  if (!f || !isFilterActive(f)) return null
  const parts: string[] = []
  const paths = (f.paths || []).filter(p => !!normalizePathPrefix(p))
  if (paths.length > 0) parts.push(`path: ${paths.join(', ')}`)
  if ((f.tags || []).length > 0) parts.push(`tags(${f.tagsLogic || 'ANY'}): ${(f.tags || []).join(', ')}`)
  if (f.nameKeyword) parts.push(`name:"${f.nameKeyword}"`)
  if (f.descriptionKeyword) parts.push(`desc:"${f.descriptionKeyword}"`)
  if (f.startsWith) parts.push(`starts:${f.startsWith}${f.startsEndsCaseSensitive ? '' : ' (i)'}`)
  if (f.endsWith) parts.push(`ends:${f.endsWith}${f.startsEndsCaseSensitive ? '' : ' (i)'}`)
  if (f.startDateFrom || f.startDateTo) parts.push(`start:${f.startDateFrom || ''}..${f.startDateTo || ''}`)
  if (f.dueDateFrom || f.dueDateTo) parts.push(`due:${f.dueDateFrom || ''}..${f.dueDateTo || ''}`)
  if (f.hasAttachments) parts.push('attachments')
  if ((f.linkedFromNodeTags || []).length > 0) parts.push(`linkedFrom(${(f.linkedFromNodeTags || []).length})`)
  return parts.join('  •  ')
}
