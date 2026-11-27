import { DEFAULT_FILTERS, type NodeFilterState } from '../components/NodeFiltersDialog'

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

// True if the filter hides the pages it matches instead of keeping them (#35).
// Filters saved before #35 have no mode and include.
export const isExcludeFilter = (f: FilterLike | null | undefined): boolean => f?.mode === 'exclude'

// Does a page pass every active field, ignoring the Include/Exclude mode?
const matchesCriteria = (page: FilterablePage, f: FilterLike, linkedTargets: Set<string> | null): boolean => {
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

// Does a single filter keep this page? An Exclude filter keeps the pages its fields don't
// match. `linkedTargets` comes from buildLinkedTargets.
export const matchesNodeFilters = (page: FilterablePage, f: FilterLike, linkedTargets: Set<string> | null): boolean => {
  const matched = matchesCriteria(page, f, linkedTargets)
  return isExcludeFilter(f) ? !matched : matched
}

export type FilterEntry = { f: FilterLike; linked: Set<string> | null }

// Does a list of filters keep this page (Groups, #68/#35)? The page must match any Include
// filter (or there are none) and no Exclude filter. Pass active filters only.
export const matchesFilterSet = (page: FilterablePage, entries: FilterEntry[]): boolean => {
  const includes = entries.filter(e => !isExcludeFilter(e.f))
  const excludes = entries.filter(e => isExcludeFilter(e.f))
  if (includes.length > 0 && !includes.some(e => matchesCriteria(page, e.f, e.linked))) return false
  return !excludes.some(e => matchesCriteria(page, e.f, e.linked))
}

// Builds the entries for matchesFilterSet: active filters only, each with its linked targets
export const filterEntries = (filters: FilterLike[], pages: Iterable<FilterablePage>): FilterEntry[] => {
  const active = filters.filter(isFilterActive)
  if (active.length === 0) return []
  const list = Array.from(pages)
  return active.map(f => ({ f, linked: buildLinkedTargets(f, list) }))
}

// The most filters a list (a group, the Graph, the Compiler, a chart) can hold
export const MAX_FILTERS = 20

// Filters saved before #68/#167 are a single object; newer ones are a list. Always returns at
// least one (blank) filter so the editor has something to show.
export const normalizeFilters = (raw: unknown): NodeFilterState[] => {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  const filters = list
    .filter((f): f is Partial<NodeFilterState> => !!f && typeof f === 'object')
    .slice(0, MAX_FILTERS)
    .map(f => ({ ...DEFAULT_FILTERS, ...f }))
  return filters.length > 0 ? filters : [{ ...DEFAULT_FILTERS }]
}

// True if any filter in the list narrows the pages
export const isAnyFilterActive = (filters: FilterLike[] | null | undefined): boolean => (filters || []).some(isFilterActive)

// True if any active filter in the list reads page metadata
export const needsMetadataAny = (filters: FilterLike[]): boolean => filters.some(f => isFilterActive(f) && needsMetadata(f))

// True if the filter has a non-blank path prefix
export const hasActivePaths = (f: FilterLike): boolean => activePaths(f).length > 0

// Short text for the filter chip, or null when nothing is filtered. Exclude filters start
// with "exclude: " unless `withMode` is false (for callers that label the mode themselves).
export const summarizeFilters = (f: FilterLike | null | undefined, { withMode = true } = {}): string | null => {
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
  const text = parts.join('  •  ')
  return withMode && isExcludeFilter(f) ? `exclude: ${text}` : text
}
