import { memo, useMemo } from 'react'
import type { NodeProps } from 'react-flow-renderer'

type Chip = { id: string; title: string }

type Data = {
  label: string
  isEquivalent?: boolean
  chips?: Chip[]
  remainderChips?: Chip[]
  showNodeCards?: boolean
  linkPairs?: Array<{ from: string; to: string }>
  visibleCardCount?: number
  totalCardCount?: number
}

function GroupBoxNode({ data, selected }: NodeProps<Data>) {
  const { label, isEquivalent, chips = [], remainderChips = [], showNodeCards, linkPairs = [], visibleCardCount, totalCardCount, showCapIndicator } = data || {}
  const chipItems = useMemo(() => chips.slice(0, 30), [chips])
  const remainderItems = useMemo(() => remainderChips.slice(0, 30), [remainderChips])
  const extra = chips.length > chipItems.length ? chips.length - chipItems.length : 0
  const extraRem = remainderChips.length > remainderItems.length ? remainderChips.length - remainderItems.length : 0
  return (
    <div className="rounded-md border h-full w-full bg-background text-foreground flex flex-col overflow-hidden" style={{ borderStyle: isEquivalent ? 'dotted' as const : 'solid' as const }}>
      <div className="px-2 py-1 text-sm font-medium border-b flex items-center justify-between gap-2">
        <span className="truncate" title={label}>{label}</span>
        <span className="text-[11px] text-muted-foreground ml-2 whitespace-nowrap">
          {chips.length} nodes
          {showNodeCards && typeof visibleCardCount === 'number' && typeof totalCardCount === 'number' && totalCardCount > visibleCardCount && (
            <>
              {' '}
              • showing {visibleCardCount}
            </>
          )}
        </span>
      </div>
      <div className="p-2 flex-1 overflow-auto">
        {!showNodeCards && (
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1 min-w-0">
              {chipItems.map(c => (
                <div key={c.id} className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground truncate" title={c.title}>{c.title}</div>
              ))}
              {extra > 0 && (
                <div className="px-2 py-0.5 text-[11px] text-muted-foreground">+{extra} more</div>
              )}
              {remainderItems.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-medium mb-1">Remainder</div>
                  {remainderItems.map(c => (
                    <div key={c.id} className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground truncate" title={c.title}>{c.title}</div>
                  ))}
                  {extraRem > 0 && (
                    <div className="px-2 py-0.5 text-[11px] text-muted-foreground">+{extraRem} more</div>
                  )}
                </div>
              )}
            </div>
            {linkPairs.length > 0 && (
              <div className="w-24 text-[10px] text-muted-foreground overflow-auto border-l pl-2">
                {linkPairs.map((p, idx) => (
                  <div key={idx} className="truncate" title={`${p.from} → ${p.to}`}>→ {p.to}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {showNodeCards && (
          <div className="text-[11px] text-muted-foreground">
            Node cards view
            {typeof visibleCardCount === 'number' && typeof totalCardCount === 'number' && totalCardCount > visibleCardCount && showCapIndicator && (
              <span> • {totalCardCount - visibleCardCount} hidden due to cap</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(GroupBoxNode)


