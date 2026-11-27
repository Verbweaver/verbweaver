import { useState } from 'react'
import { Filter as FilterIcon, Plus, Trash2, X } from 'lucide-react'
import NodeFiltersDialog, { DEFAULT_FILTERS, type NodeFilterState } from './NodeFiltersDialog'
import { summarizeFilters, isExcludeFilter, isAnyFilterActive, MAX_FILTERS } from '../utils/nodeFilters'

// One line per filter: "Filter 1 / or Filter 2 / except Filter 3", or a single "<singleLabel>: …"
// line when there is only one filter. Shared by the Groups panel and FilterList (#68, #35, #167).
export function FilterSummaryLines({ filters, onEdit, onRemove, singleLabel = 'Active' }: {
  filters: NodeFilterState[]
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  singleLabel?: string
}) {
  const several = filters.length > 1
  // With several filters the label says "except", so the summary leaves out "exclude:"
  let includeCount = 0
  const lines = filters
    .map((f, index) => ({ index, summary: summarizeFilters(f, { withMode: !several }) }))
    .filter(s => s.summary || several)
    .map(s => ({ ...s, includeLine: isExcludeFilter(filters[s.index]) ? -1 : includeCount++ }))

  return (
    <>
      {lines.map(({ index, summary, includeLine }) => {
        const text = summary || '(empty)'
        const label = several
          ? (isExcludeFilter(filters[index]) ? `except Filter ${index + 1}` : `${includeLine > 0 ? 'or ' : ''}Filter ${index + 1}`)
          : singleLabel
        return (
          <div key={index} className="flex items-start gap-1 text-[11px] text-muted-foreground" data-testid="filter-line">
            <div className="flex-1 min-w-0 whitespace-normal break-words" title={text}>{label}: {text}</div>
            {several && (
              <>
                <button className="shrink-0 p-0.5 rounded hover:bg-accent" onClick={() => onEdit(index)} title={`Edit filter ${index + 1}`} aria-label={`Edit filter ${index + 1}`}>
                  <FilterIcon className="w-3 h-3" />
                </button>
                <button className="shrink-0 p-0.5 rounded hover:bg-accent" onClick={() => onRemove(index)} title={`Remove filter ${index + 1}`} aria-label={`Remove filter ${index + 1}`}>
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

// A Filters button, a + button to add another filter, and a line per filter. Pages pass if they
// match any Include filter and no Exclude filter (see matchesFilterSet). Used by the Graph,
// Compiler and Progression chart (#167).
export default function FilterList({ filters, onChange, className = '' }: {
  filters: NodeFilterState[]
  onChange: (filters: NodeFilterState[]) => void
  className?: string
}) {
  const list = filters.length > 0 ? filters : [{ ...DEFAULT_FILTERS }]
  const [editing, setEditing] = useState<number | null>(null)

  const update = (index: number, next: NodeFilterState) => onChange(list.map((f, i) => (i === index ? next : f)))
  const add = () => {
    if (list.length >= MAX_FILTERS) return
    onChange([...list, { ...DEFAULT_FILTERS }])
    setEditing(list.length)
  }
  // Back to one blank filter, like a fresh view
  const clear = () => onChange([{ ...DEFAULT_FILTERS }])
  const canClear = list.length > 1 || isAnyFilterActive(list)
  const remove = (index: number) => {
    const rest = list.filter((_, i) => i !== index)
    onChange(rest.length > 0 ? rest : [{ ...DEFAULT_FILTERS }])
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-stretch gap-1">
        <button
          className="flex-1 text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent flex items-center gap-2"
          onClick={() => setEditing(0)}
          title="Filter pages by path, tags, keywords, dates, and more"
        >
          <FilterIcon className="w-4 h-4" />
          <span>Filters</span>
        </button>
        <button
          className="px-2 border border-input rounded hover:bg-accent inline-flex items-center disabled:opacity-50"
          onClick={add}
          disabled={list.length >= MAX_FILTERS}
          title="Add filter: pages matching any Include filter and no Exclude filter are shown"
          aria-label="Add filter"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          className="px-2 border border-input rounded hover:bg-destructive hover:text-destructive-foreground inline-flex items-center gap-1 text-xs disabled:opacity-50 disabled:pointer-events-none"
          onClick={clear}
          disabled={!canClear}
          title="Remove all filters"
          data-testid="filters-clear"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>
      <FilterSummaryLines filters={list} onEdit={setEditing} onRemove={remove} singleLabel="Active filters" />
      {editing !== null && list[editing] && (
        <NodeFiltersDialog
          isOpen
          filters={list[editing]}
          onFiltersChange={(f) => update(editing, f)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
