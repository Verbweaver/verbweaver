import { useMemo, useState } from 'react'
import { Plus, Trash2, Edit, Filter as FilterIcon, ToggleLeft, X, Tags } from 'lucide-react'
import NodeFiltersDialog, { DEFAULT_FILTERS, NodeFilterState } from './NodeFiltersDialog'
import { useGroupViewStore, MAX_FILTERS_PER_GROUP, MAX_GROUPS, type GroupDefinition } from '../store/groupViewState'
import { useNodeStore } from '../store/nodeStore'
import { buildTagGroups } from '../utils/grouping'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'

const genId = () => (typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `g-${Date.now()}-${Math.floor(Math.random()*1e6)}`)

type Props = {
  className?: string
}

export default function GroupManagerPanel({ className }: Props) {
  const groups = useGroupViewStore(s => s.groups)
  const setGroups = useGroupViewStore(s => s.setGroups)
  const addGroup = useGroupViewStore(s => s.addGroup)
  const updateGroup = useGroupViewStore(s => s.updateGroup)
  const removeGroup = useGroupViewStore(s => s.removeGroup)
  const nodes = useNodeStore(s => s.nodes)

  // Which filter of which group the dialog is editing (#68)
  const [filtersOpenFor, setFiltersOpenFor] = useState<{ groupId: string; index: number } | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  // Group being deleted, waiting for confirmation (#99)
  const [confirmRemove, setConfirmRemove] = useState<GroupDefinition | null>(null)

  const handleAdd = () => {
    if (groups.length >= MAX_GROUPS) {
      toast.error(`Maximum of ${MAX_GROUPS} groups reached`)
      return
    }
    const next: GroupDefinition = {
      id: genId(),
      name: `Group ${groups.length + 1}`,
      enabled: true,
      filters: [{ ...DEFAULT_FILTERS }],
    }
    addGroup(next)
  }

  // Makes one group for each tag used by any page, skipping tags that already have one (#37)
  const handleAddByTag = () => {
    const { added, skipped, totalTags } = buildTagGroups(nodes.values(), groups, MAX_GROUPS, genId)
    if (totalTags === 0) {
      toast('No pages have tags yet')
      return
    }
    if (added.length > 0) {
      setGroups([...groups, ...added])
      toast.success(`Added ${added.length} group${added.length === 1 ? '' : 's'}`)
    } else if (skipped === 0) {
      toast('Every tag already has a group')
    }
    if (skipped > 0) {
      toast.error(`${skipped} tag${skipped === 1 ? '' : 's'} skipped: ${MAX_GROUPS}-group limit`)
    }
  }

  const handleRename = (groupId: string) => {
    const g = groups.find(g => g.id === groupId)
    if (!g) return
    setRenameId(groupId)
    setRenameValue(g.name)
  }

  const handleRenameSave = (groupId: string) => {
    const name = renameValue.trim()
    if (!name) {
      toast.error('Name cannot be empty')
      return
    }
    updateGroup(groupId, { name })
    setRenameId(null)
    setRenameValue('')
  }

  const handleRenameCancel = () => {
    setRenameId(null)
    setRenameValue('')
  }

  const handleEditFilters = (groupId: string, index = 0) => setFiltersOpenFor({ groupId, index })

  const handleFiltersChange = (nextFilters: NodeFilterState) => {
    if (!filtersOpenFor) return
    const g = groups.find(g => g.id === filtersOpenFor.groupId)
    if (!g) return
    updateGroup(g.id, { filters: g.filters.map((f, i) => (i === filtersOpenFor.index ? nextFilters : f)) })
  }

  // Adds a blank filter and opens it; a page joins the group if it matches any filter (#68)
  const handleAddFilter = (g: GroupDefinition) => {
    if (g.filters.length >= MAX_FILTERS_PER_GROUP) return
    updateGroup(g.id, { filters: [...g.filters, { ...DEFAULT_FILTERS }] })
    setFiltersOpenFor({ groupId: g.id, index: g.filters.length })
  }

  const handleRemoveFilter = (g: GroupDefinition, index: number) => {
    const rest = g.filters.filter((_, i) => i !== index)
    updateGroup(g.id, { filters: rest.length > 0 ? rest : [{ ...DEFAULT_FILTERS }] })
  }

  const activeGroup = useMemo(() => groups.find(g => g.id === filtersOpenFor?.groupId) || null, [filtersOpenFor, groups])
  const activeFilters = activeGroup && filtersOpenFor ? activeGroup.filters[filtersOpenFor.index] : undefined

  const summarizeFilters = (filters: NodeFilterState): string | null => {
    const parts: string[] = []
    if ((filters.tags || []).length > 0) parts.push(`tags(${filters.tagsLogic}): ${filters.tags.join(', ')}`)
    if (filters.nameKeyword) parts.push(`name:"${filters.nameKeyword}"`)
    if (filters.descriptionKeyword) parts.push(`desc:"${filters.descriptionKeyword}"`)
    if (filters.startsWith) parts.push(`starts:${filters.startsWith}${filters.startsEndsCaseSensitive ? '' : ' (i)'}`)
    if (filters.endsWith) parts.push(`ends:${filters.endsWith}${filters.startsEndsCaseSensitive ? '' : ' (i)'}`)
    if (filters.startDateFrom || filters.startDateTo) parts.push(`start:${filters.startDateFrom || ''}..${filters.startDateTo || ''}`)
    if (filters.dueDateFrom || filters.dueDateTo) parts.push(`due:${filters.dueDateFrom || ''}..${filters.dueDateTo || ''}`)
    if (filters.hasAttachments) parts.push('attachments')
    if ((filters.linkedFromNodeTags || []).length > 0) parts.push(`linkedFrom(${filters.linkedFromNodeTags.length})`)
    if (parts.length === 0) return null
    return parts.join('  •  ')
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Groups</div>
        <div className="flex items-center gap-1">
          <button className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-input rounded hover:bg-accent" onClick={handleAddByTag} title="Make one group for each tag">
            <Tags className="w-3 h-3" /> By tag
          </button>
          <button className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-input rounded hover:bg-accent" onClick={handleAdd}>
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 max-h-80 overflow-auto pr-1">
        {groups.length === 0 && (
          <div className="text-xs text-muted-foreground">No groups yet. Click Add to create one.</div>
        )}
        {groups.map(g => {
          const summaries = g.filters.map((f, index) => ({ index, summary: summarizeFilters(f) }))
          const filterLines = summaries.filter(s => s.summary || g.filters.length > 1)
          return (
            <div key={g.id} className="px-2 py-1 border border-border rounded bg-background/60">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={g.enabled} onChange={(e)=> updateGroup(g.id, { enabled: e.target.checked })} title="Enable/disable group" />
                <div className="flex-1 min-w-0">
                  {renameId === g.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e)=> setRenameValue(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-input rounded bg-background"
                      />
                      <button className="text-xs px-2 py-1 border border-input rounded hover:bg-accent" onClick={()=> handleRenameSave(g.id)}>Save</button>
                      <button className="text-xs px-2 py-1 border border-input rounded hover:bg-muted" onClick={handleRenameCancel}>Cancel</button>
                    </div>
                  ) : (
                    <div className="text-sm truncate" title={g.name}>{g.name}</div>
                  )}
                  {filterLines.map(({ index, summary }, line) => {
                    const text = summary || '(empty)'
                    const label = g.filters.length > 1 ? `${line > 0 ? 'or ' : ''}Filter ${index + 1}` : 'Active'
                    return (
                      <div key={index} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                        <div className="flex-1 min-w-0 whitespace-normal break-words" title={text}>{label}: {text}</div>
                        {g.filters.length > 1 && (
                          <>
                            <button className="shrink-0 p-0.5 rounded hover:bg-accent" onClick={()=> handleEditFilters(g.id, index)} title={`Edit filter ${index + 1}`} aria-label={`Edit filter ${index + 1}`}>
                              <FilterIcon className="w-3 h-3" />
                            </button>
                            <button className="shrink-0 p-0.5 rounded hover:bg-accent" onClick={()=> handleRemoveFilter(g, index)} title={`Remove filter ${index + 1}`} aria-label={`Remove filter ${index + 1}`}>
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-accent" onClick={()=> handleRename(g.id)} title="Rename">
                  <Edit className="w-3 h-3" />
                </button>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-accent inline-flex items-center gap-1" onClick={()=> handleEditFilters(g.id)} title="Edit filters">
                  <FilterIcon className="w-3 h-3" />
                </button>
                <button
                  className="text-xs px-1 py-0.5 border border-input rounded hover:bg-accent inline-flex items-center disabled:opacity-50"
                  onClick={()=> handleAddFilter(g)}
                  disabled={g.filters.length >= MAX_FILTERS_PER_GROUP}
                  title="Add filter: pages matching any filter join the group"
                  aria-label="Add filter"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-destructive hover:text-destructive-foreground" onClick={()=> setConfirmRemove(g)} title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {activeFilters && (
        <NodeFiltersDialog
          isOpen={!!filtersOpenFor}
          onClose={() => setFiltersOpenFor(null)}
          filters={activeFilters}
          onFiltersChange={handleFiltersChange}
        />
      )}
      <ConfirmDialog
        isOpen={!!confirmRemove}
        title="Delete group"
        message={`Delete the group "${confirmRemove?.name || ''}"? Your pages are not affected.`}
        onConfirm={() => { if (confirmRemove) removeGroup(confirmRemove.id); setConfirmRemove(null) }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}


