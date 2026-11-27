import { useState, useRef, useEffect } from 'react'
import { parseList } from '../utils/nodeFilters'

export interface NodeFilterState {
  // include keeps the pages that match; exclude hides them (#35). Missing means include.
  mode?: 'include' | 'exclude'
  tags: string[]
  tagsLogic: 'ANY' | 'ALL'
  nameKeyword: string
  descriptionKeyword: string
  startsWith: string
  endsWith: string
  startsEndsCaseSensitive: boolean
  startDateFrom?: string
  startDateTo?: string
  dueDateFrom?: string
  dueDateTo?: string
  hasAttachments: boolean
  linkedFromNodeTags: string[] // e.g., ['node-abc', 'node-xyz']
  paths: string[] // path prefixes, e.g. ['characters', 'places/north']; a page matches any of them (#34)
}

export const DEFAULT_FILTERS: NodeFilterState = {
  mode: 'include',
  tags: [],
  tagsLogic: 'ANY',
  nameKeyword: '',
  descriptionKeyword: '',
  startsWith: '',
  endsWith: '',
  startsEndsCaseSensitive: false,
  startDateFrom: undefined,
  startDateTo: undefined,
  dueDateFrom: undefined,
  dueDateTo: undefined,
  hasAttachments: false,
  linkedFromNodeTags: [],
  paths: [],
}

// A comma-separated list input. Keeps what the user typed (including a trailing comma)
// and only resyncs when the list changes from outside, e.g. Clear.
function ListInput({ value, onChange, placeholder, testId }: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  testId?: string
}) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => {
    setText(prev => (parseList(prev).join('\n') === value.join('\n') ? prev : value.join(', ')))
  }, [value])
  return (
    <input
      className="w-full px-2 py-1 border border-input rounded bg-background"
      value={text}
      onChange={(e) => { setText(e.target.value); onChange(parseList(e.target.value)) }}
      placeholder={placeholder}
      data-testid={testId}
    />
  )
}

interface NodeFiltersDialogProps {
  filters: NodeFilterState
  onFiltersChange: (filters: NodeFilterState) => void
  isOpen: boolean
  onClose: () => void
}

export default function NodeFiltersDialog({
  filters,
  onFiltersChange,
  isOpen,
  onClose,
}: NodeFiltersDialogProps) {
  const startFromRef = useRef<HTMLInputElement | null>(null)
  const startToRef = useRef<HTMLInputElement | null>(null)
  const dueFromRef = useRef<HTMLInputElement | null>(null)
  const dueToRef = useRef<HTMLInputElement | null>(null)

  const updateFilters = (next: Partial<NodeFilterState>) => {
    const merged = { ...filters, ...next }
    onFiltersChange(merged)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg w-[640px] max-w-[95vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Filters</h3>
            <div className="inline-flex border border-input rounded overflow-hidden text-xs" role="group" aria-label="Filter mode" data-testid="filter-mode">
              {(['include', 'exclude'] as const).map(m => {
                const selected = (filters.mode || 'include') === m
                return (
                  <button
                    key={m}
                    type="button"
                    className={`px-2 py-1 ${selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                    aria-pressed={selected}
                    data-testid={`filter-mode-${m}`}
                    onClick={() => updateFilters({ mode: m })}
                    title={m === 'include' ? 'Show only pages that match' : 'Hide pages that match'}
                  >
                    {m === 'include' ? 'Include' : 'Exclude'}
                  </button>
                )
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              {filters.mode === 'exclude' ? 'Pages that match are hidden.' : 'Only pages that match are shown.'}
            </span>
          </div>
          <button className="px-2 py-1 text-xs border rounded" onClick={() => { onFiltersChange(DEFAULT_FILTERS) }}>
            Clear
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-2">
            <label className="block text-xs font-medium">Tags (comma-separated)</label>
            <ListInput
              value={filters.tags || []}
              onChange={(tags) => updateFilters({ tags })}
              placeholder="e.g. design, api"
            />
            <label className="inline-flex items-center gap-2 text-xs mt-1">
              <span>Match:</span>
              <select
                className="px-2 py-1 border border-input rounded bg-background"
                value={filters.tagsLogic}
                onChange={(e) => updateFilters({ tagsLogic: e.target.value as 'ANY' | 'ALL' })}
              >
                <option value="ANY">ANY</option>
                <option value="ALL">ALL</option>
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium">Keyword in name (title)</label>
            <input
              className="w-full px-2 py-1 border border-input rounded bg-background"
              value={filters.nameKeyword}
              onChange={(e) => updateFilters({ nameKeyword: e.target.value })}
              placeholder="case-insensitive"
            />
            <label className="block text-xs font-medium">Keyword in description</label>
            <input
              className="w-full px-2 py-1 border border-input rounded bg-background"
              value={filters.descriptionKeyword}
              onChange={(e) => updateFilters({ descriptionKeyword: e.target.value })}
              placeholder="case-insensitive"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium">Starts with (title)</label>
            <input
              className="w-full px-2 py-1 border border-input rounded bg-background"
              value={filters.startsWith}
              onChange={(e) => updateFilters({ startsWith: e.target.value })}
            />
            <label className="block text-xs font-medium">Ends with (e.g. .expiration)</label>
            <input
              className="w-full px-2 py-1 border border-input rounded bg-background"
              value={filters.endsWith}
              onChange={(e) => updateFilters({ endsWith: e.target.value })}
            />
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="rounded"
                checked={filters.startsEndsCaseSensitive}
                onChange={(e) => updateFilters({ startsEndsCaseSensitive: e.target.checked })}
              />
              Case sensitive
            </label>
            <label className="block text-xs font-medium">Path starts with (comma-separated)</label>
            <ListInput
              value={filters.paths || []}
              onChange={(paths) => updateFilters({ paths })}
              placeholder="e.g. characters, places/north"
              testId="filter-paths"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium">Start date range (YYYY-MM-DD)</label>
            <div className="flex gap-2">
              <input
                ref={startFromRef}
                type="date"
                className="px-2 py-1 border border-input rounded bg-background w-full"
                value={filters.startDateFrom || ''}
                onChange={(e) => updateFilters({ startDateFrom: e.target.value || undefined })}
                onFocus={() => { try { (startFromRef.current as any)?.showPicker?.() } catch {} }}
                onClick={() => { try { (startFromRef.current as any)?.showPicker?.() } catch {} }}
              />
              <input
                ref={startToRef}
                type="date"
                className="px-2 py-1 border border-input rounded bg-background w-full"
                value={filters.startDateTo || ''}
                onChange={(e) => updateFilters({ startDateTo: e.target.value || undefined })}
                onFocus={() => { try { (startToRef.current as any)?.showPicker?.() } catch {} }}
                onClick={() => { try { (startToRef.current as any)?.showPicker?.() } catch {} }}
              />
            </div>
            <label className="block text-xs font-medium">Due date range (YYYY-MM-DD)</label>
            <div className="flex gap-2">
              <input
                ref={dueFromRef}
                type="date"
                className="px-2 py-1 border border-input rounded bg-background w-full"
                value={filters.dueDateFrom || ''}
                onChange={(e) => updateFilters({ dueDateFrom: e.target.value || undefined })}
                onFocus={() => { try { (dueFromRef.current as any)?.showPicker?.() } catch {} }}
                onClick={() => { try { (dueFromRef.current as any)?.showPicker?.() } catch {} }}
              />
              <input
                ref={dueToRef}
                type="date"
                className="px-2 py-1 border border-input rounded bg-background w-full"
                value={filters.dueDateTo || ''}
                onChange={(e) => updateFilters({ dueDateTo: e.target.value || undefined })}
                onFocus={() => { try { (dueToRef.current as any)?.showPicker?.() } catch {} }}
                onClick={() => { try { (dueToRef.current as any)?.showPicker?.() } catch {} }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs mt-5">
              <input
                type="checkbox"
                className="rounded"
                checked={filters.hasAttachments}
                onChange={(e) => updateFilters({ hasAttachments: e.target.checked })}
              />
              Has any file attachments
            </label>
          </div>

          <div className="space-y-2 col-span-2">
            <label className="block text-xs font-medium">Linked from node(s) (node ID tags, comma-separated)</label>
            <ListInput
              value={filters.linkedFromNodeTags || []}
              onChange={(linkedFromNodeTags) => updateFilters({ linkedFromNodeTags })}
              placeholder="e.g. node-123, node-456"
            />
            <p className="text-[10px] text-muted-foreground">
              Includes nodes that are targets of the outgoing links from the specified node(s).
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="px-3 py-1.5 border rounded" onClick={onClose}>
            Cancel
          </button>
          <button className="px-3 py-1.5 border rounded bg-primary text-primary-foreground" onClick={onClose}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

