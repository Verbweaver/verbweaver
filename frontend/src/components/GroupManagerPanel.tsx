import { useMemo, useState } from 'react'
import { Plus, Trash2, Edit, Filter as FilterIcon, ToggleLeft } from 'lucide-react'
import NodeFiltersDialog, { DEFAULT_FILTERS, NodeFilterState } from './NodeFiltersDialog'
import { useGroupViewStore, type GroupDefinition } from '../store/groupViewState'
import toast from 'react-hot-toast'

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

  const [filtersOpenFor, setFiltersOpenFor] = useState<string | null>(null)

  const handleAdd = () => {
    if (groups.length >= 50) {
      toast.error('Maximum of 50 groups reached')
      return
    }
    const next: GroupDefinition = {
      id: genId(),
      name: `Group ${groups.length + 1}`,
      enabled: true,
      filters: { ...DEFAULT_FILTERS },
    }
    addGroup(next)
  }

  const handleRename = (groupId: string) => {
    const g = groups.find(g => g.id === groupId)
    if (!g) return
    const name = prompt('Rename group', g.name)
    if (!name) return
    updateGroup(groupId, { name })
  }

  const handleEditFilters = (groupId: string) => setFiltersOpenFor(groupId)

  const handleFiltersChange = (nextFilters: NodeFilterState) => {
    const id = filtersOpenFor
    if (!id) return
    updateGroup(id, { filters: nextFilters })
  }

  const activeGroup = useMemo(() => groups.find(g => g.id === filtersOpenFor) || null, [filtersOpenFor, groups])

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
        <button className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-input rounded hover:bg-accent" onClick={handleAdd}>
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-80 overflow-auto pr-1">
        {groups.length === 0 && (
          <div className="text-xs text-muted-foreground">No groups yet. Click Add to create one.</div>
        )}
        {groups.map(g => {
          const summary = summarizeFilters(g.filters)
          return (
            <div key={g.id} className="px-2 py-1 border border-border rounded bg-background/60">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={g.enabled} onChange={(e)=> updateGroup(g.id, { enabled: e.target.checked })} title="Enable/disable group" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" title={g.name}>{g.name}</div>
                  {summary && (
                    <div className="text-[11px] text-muted-foreground truncate" title={summary}>
                      Active: {summary}
                    </div>
                  )}
                </div>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-accent" onClick={()=> handleRename(g.id)} title="Rename">
                  <Edit className="w-3 h-3" />
                </button>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-accent inline-flex items-center gap-1" onClick={()=> handleEditFilters(g.id)} title="Edit filters">
                  <FilterIcon className="w-3 h-3" />
                </button>
                <button className="text-xs px-1 py-0.5 border border-input rounded hover:bg-destructive hover:text-destructive-foreground" onClick={()=> removeGroup(g.id)} title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {activeGroup && (
        <NodeFiltersDialog
          isOpen={!!filtersOpenFor}
          onClose={() => setFiltersOpenFor(null)}
          filters={activeGroup.filters}
          onFiltersChange={handleFiltersChange}
        />
      )}
    </div>
  )
}


