import { useCallback, useRef } from 'react'
import { useGroupViewStore, type GroupViewPersisted } from '../store/groupViewState'
import { Download, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

type Props = {
  projectId?: string
  tabId?: string
}

export default function GroupOptionsTray({ projectId, tabId }: Props) {
  const nestGroups = useGroupViewStore(s => s.options.nestGroups)
  const showNodeCards = useGroupViewStore(s => !!s.options.showNodeCards)
  const maxCardsPerGroup = useGroupViewStore(s => s.options.maxCardsPerGroup || 40)
  const showCapIndicator = useGroupViewStore(s => s.options.showCapIndicator !== false)
  const setOptions = useGroupViewStore(s => s.setOptions)
  const replaceLayout = useGroupViewStore(s => s.replaceLayout)
  const exportConfig = useGroupViewStore(s => s.exportConfig)
  const importConfig = useGroupViewStore(s => s.importConfig)
  const saveToStorage = useGroupViewStore(s => s.saveToStorage)
  const requestLayout = useGroupViewStore(s => s.requestLayout)

  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleExport = useCallback(() => {
    const cfg = exportConfig()
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `group-view-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('Export started')
  }, [exportConfig])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const obj = JSON.parse(text) as GroupViewPersisted
        importConfig(obj)
        if (projectId && tabId) saveToStorage(projectId, tabId)
        toast.success('Group configuration imported')
      } catch (err) {
        toast.error('Failed to import configuration')
      } finally {
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }, [importConfig, projectId, tabId, saveToStorage])

  return (
    <div className="bg-background/80 border border-border rounded shadow w-64">
      <button
        className="w-full flex items-center justify-between px-2 py-1 text-sm"
        aria-expanded={true}
      >
        <span>Options</span>
        <span className="text-xs">▾</span>
      </button>
      <div className="p-2 flex flex-col gap-2">
        <label className="inline-flex items-center gap-2 text-sm" title="Display groups as nested boxes; hides edges.">
          <input
            type="checkbox"
            checked={nestGroups}
            onChange={(e) => setOptions({ nestGroups: e.target.checked })}
          />
          Nest groups
        </label>
        <label className="inline-flex items-center gap-2 text-sm" title="Render full node cards and soft links inside groups (heavier).">
          <input
            type="checkbox"
            checked={showNodeCards}
            onChange={(e) => setOptions({ showNodeCards: e.target.checked })}
          />
          Show node cards
        </label>
        <div className="flex items-center gap-2 text-sm">
          <label className="whitespace-nowrap" title="Limit the number of node cards rendered per group to protect performance.">Max cards</label>
          <input
            type="number"
            min={5}
            max={200}
            value={maxCardsPerGroup}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isFinite(v)) return
              setOptions({ maxCardsPerGroup: Math.max(5, Math.min(200, Math.round(v))) })
            }}
            className="w-20 px-2 py-1 border border-input rounded bg-background"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm" title="Show a small indicator when node cards are truncated by the cap.">
          <input
            type="checkbox"
            checked={showCapIndicator}
            onChange={(e) => setOptions({ showCapIndicator: e.target.checked })}
          />
          Show cap indicator
        </label>
        <button className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent inline-flex items-center gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" /> Export JSON
        </button>
        <button className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent" onClick={()=> requestLayout()}>
          Auto layout
        </button>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
          <button className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent inline-flex items-center gap-2" onClick={()=> fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> Import JSON
          </button>
        </div>
        <button className="w-full text-left px-2 py-1 text-sm border border-input rounded hover:bg-accent" onClick={()=> replaceLayout({ boxes: {} })}>
          Clear layout
        </button>
      </div>
    </div>
  )
}


