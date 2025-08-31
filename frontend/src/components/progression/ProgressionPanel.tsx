import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react'
import ProgressionChart, { Series } from './ProgressionChart'
import NodeSelector, { NodeFilterState } from '../NodeSelector'
import NodeOrderingPanel from '../NodeOrderingPanel'
import { useNodeStore } from '../../store/nodeStore'
import { useProjectStore } from '../../store/projectStore'
import { useTabStore } from '../../store/tabStore'
import { Network, ListTree, LineChart } from 'lucide-react'
import clsx from 'clsx'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

type SubView = 'mindmap' | 'outline' | 'progression'

interface ProgressionConfig {
  xVar: string
  xType: 'string' | 'number'
  colocateRepeats: boolean
  yVars: { name: string; color: string }[]
  labelAxes: boolean
  showNodeTitles: boolean
  showXAxisNodeTitles: boolean
  background: 'transparent' | string
  maxNodes: number
  manualOrdering: boolean
  orderedNodes: string[]
  filters?: NodeFilterState
  selectedNodes: string[]
}

const DEFAULT_CONFIG: ProgressionConfig = {
  xVar: '',
  xType: 'string',
  colocateRepeats: false,
  yVars: [],
  labelAxes: true,
  showNodeTitles: false,
  showXAxisNodeTitles: false,
  background: 'white',
  maxNodes: 20,
  manualOrdering: false,
  orderedNodes: [],
  filters: undefined,
  selectedNodes: [],
}

type ProgressionPanelProps = { onSwitchSubView?: (v: SubView) => void; tabId?: string }

export default function ProgressionPanel(
  props: ProgressionPanelProps
) {
  const { onSwitchSubView, tabId } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 480 })
  const { currentProject } = useProjectStore()
  const { nodes: nodeMap, loadNodes } = useNodeStore()
  const { getActiveTab, updateTabMetadata } = useTabStore()

  const computeInitialConfig = (explicitTabId?: string): { cfg: ProgressionConfig; restored: boolean } => {
    try {
      const tabs = useTabStore.getState()
      const proj = useProjectStore.getState().currentProject
      const tab = explicitTabId ? tabs.getTabById(explicitTabId) : tabs.getActiveTab()
      const meta: any = (tab?.metadata as any) || {}
      const projId = proj?.id
      const byProject = meta?.progressionConfigByProject as Record<string, ProgressionConfig> | undefined
      const saved = (projId && byProject && byProject[projId]) || (meta.progressionConfig as ProgressionConfig | undefined)
      if (saved) {
        try { console.log('[Progression] Initializing from saved config (synchronous)', { tabId: tab?.id, projId, saved }) } catch {}
        return { cfg: saved, restored: true }
      }
    } catch {}
    return { cfg: DEFAULT_CONFIG, restored: false }
  }
  const initial = computeInitialConfig(tabId)
  const [config, setConfig] = useState<ProgressionConfig>(initial.cfg)
  const initialRestoredRef = useRef<boolean>(initial.restored)
  const configRef = useRef<ProgressionConfig>(DEFAULT_CONFIG)
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false)
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false)
  const hasLoadedFromTabRef = useRef<boolean>(false)
  const [isRestoring, setIsRestoring] = useState<boolean>(initial.restored)
  const pendingRestoreRef = useRef<boolean>(false)

  // Stable callbacks for manual ordering to avoid hook ordering issues
  const handleOrderChange = useCallback((ordered: string[]) => {
    setConfig(c => ({ ...c, orderedNodes: ordered }))
  }, [])

  const handleRemoveNodes = useCallback((removed: string[]) => {
    setConfig(c => ({ ...c, selectedNodes: c.selectedNodes.filter(p => !removed.includes(p)) }))
  }, [])
  // If we had a synchronous initial restore, mark as loaded after first paint
  useEffect(() => {
    if (initialRestoredRef.current) {
      console.log('[Progression] Synchronous initial restore complete; enabling saves')
      hasLoadedFromTabRef.current = true
      setIsRestoring(false)
      initialRestoredRef.current = false
    }
  }, [])

  // Restore from tab metadata (prefer per-project)
  useEffect(() => {
    const tab = (tabId ? useTabStore.getState().getTabById(tabId) : getActiveTab())
    try { console.log('[Progression] Mount/Reload - Active tab snapshot', { tabId: tab?.id, metadata: tab?.metadata }) } catch {}
    const meta = (tab?.metadata as any) || {}
    const projId = currentProject?.id
    const byProject = (meta as any)?.progressionConfigByProject as Record<string, ProgressionConfig> | undefined
    const saved = (projId && byProject && byProject[projId]) || (meta.progressionConfig as ProgressionConfig | undefined)
    if (saved) {
      console.log('[Progression] Restoring config from tab', { tabId: tab?.id, projId, saved })
      pendingRestoreRef.current = true
      setIsRestoring(true)
      setConfig(saved)
    } else {
      console.log('[Progression] No saved config found; using defaults', { tabId: tab?.id, projId })
      hasLoadedFromTabRef.current = true
      setIsRestoring(false)
    }
  }, [getActiveTab, currentProject?.id, tabId])

  // After any config change during a restore, mark restoration complete so subsequent changes can be saved
  useEffect(() => {
    if (pendingRestoreRef.current && isRestoring) {
      console.log('[Progression] Initial restored config applied; enabling saves now')
      hasLoadedFromTabRef.current = true
      setIsRestoring(false)
      pendingRestoreRef.current = false
    }
  }, [config, isRestoring])

  // Persist to tab metadata on change (after initial restore). Save per-project when available
  useEffect(() => {
    if (!hasLoadedFromTabRef.current || isRestoring) return
    const tab = (tabId ? useTabStore.getState().getTabById(tabId) : getActiveTab())
    if (tab) {
      const projId = currentProject?.id
      console.log('[Progression] Saving config (effect)', { tabId: tab.id, projId, config })
      updateTabMetadata(tab.id, (prev) => {
        const next: any = { ...(prev || {}) }
        if (projId) {
          const existing = (next.progressionConfigByProject && typeof next.progressionConfigByProject === 'object') ? next.progressionConfigByProject : {}
          next.progressionConfigByProject = { ...existing, [projId]: config }
        } else {
          next.progressionConfig = config
        }
        return next
      })
    }
  }, [config, getActiveTab, updateTabMetadata, currentProject?.id, tabId, isRestoring])

  // Keep a live ref of config for reliable unmount save (sync before paint/unmount)
  useLayoutEffect(() => {
    configRef.current = config
  }, [config])

  // Do not save on unmount; rely on per-change saves to avoid writing defaults during rapid transitions
  useEffect(() => {
    return () => {
      const tab = (tabId ? useTabStore.getState().getTabById(tabId) : getActiveTab())
      if (tab) console.log('[Progression] Unmount: no save (effect-based persistence active)', { tabId: tab.id })
    }
  }, [getActiveTab, tabId])

  // Load nodes
  useEffect(() => {
    if (currentProject) loadNodes().catch(() => {})
  }, [currentProject, loadNodes])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: Math.max(300, r.width), h: Math.max(240, r.height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const scopePaths = useMemo(() => {
    // If user explicitly selected nodes, start with those; otherwise start with all files (not folders)
    let paths = config.selectedNodes.length > 0 ? config.selectedNodes : Array.from(nodeMap.keys()).filter(p => !nodeMap.get(p)?.isDirectory)

    // Apply filters when present (behaviorally mirroring NodeSelector)
    const f = config.filters
    if (f) {
      const usingFilters = (
        (f.tags && f.tags.length > 0) || f.nameKeyword || f.descriptionKeyword || f.startsWith || f.endsWith ||
        f.startDateFrom || f.startDateTo || f.dueDateFrom || f.dueDateTo || f.hasAttachments || (f.linkedFromNodeTags && f.linkedFromNodeTags.length > 0)
      )
      if (usingFilters) {
        const normalizeId = (s: string) => String(s || '').replace(/^node-/, '')
        const sourceIds = new Set<string>((f.linkedFromNodeTags || []).map(normalizeId).filter(Boolean))
        const outgoingTargetIds = new Set<string>()
        if (sourceIds.size > 0) {
          for (const n of nodeMap.values()) {
            const nid = (n?.metadata as any)?.id
            if (nid && sourceIds.has(String(nid))) {
              const links: string[] = Array.isArray((n?.metadata as any)?.links) ? (n as any).metadata.links : []
              links.forEach(id => { if (id) outgoingTargetIds.add(String(id)) })
            }
          }
        }
        const matches = (path: string): boolean => {
          const node = nodeMap.get(path)
          if (!node) return false
          const meta: any = node.metadata || {}
          const title = String(meta?.title || node.name || '')
          const description = String(meta?.description || '')
          const tags: string[] = Array.isArray(meta?.tags) ? meta.tags.map(String) : []
          const startDate = String(meta?.task?.startDate || '')
          const dueDate = String(meta?.task?.dueDate || '')
          const files = Array.isArray(meta?.task?.files) ? meta.task.files : []
          const nodeId = String(meta?.id || '')

          if (f.nameKeyword) {
            const q = f.nameKeyword.toLowerCase()
            if (!title.toLowerCase().includes(q)) return false
          }
          if (f.descriptionKeyword) {
            const q = f.descriptionKeyword.toLowerCase()
            if (!description.toLowerCase().includes(q)) return false
          }
          if (f.startsWith) {
            if (f.startsEndsCaseSensitive) {
              if (!title.startsWith(f.startsWith)) return false
            } else {
              if (!title.toLowerCase().startsWith(f.startsWith.toLowerCase())) return false
            }
          }
          if (f.endsWith) {
            if (f.startsEndsCaseSensitive) {
              if (!title.endsWith(f.endsWith)) return false
            } else {
              if (!title.toLowerCase().endsWith(f.endsWith.toLowerCase())) return false
            }
          }
          if ((f.tags || []).length > 0) {
            const set = new Set(tags.map(t=>t.toLowerCase()))
            const wanted = (f.tags || []).map(t=>t.toLowerCase())
            if (f.tagsLogic === 'ANY') {
              if (!wanted.some(t=> set.has(t))) return false
            } else {
              if (!wanted.every(t=> set.has(t))) return false
            }
          }
          if (f.startDateFrom && (!startDate || startDate < f.startDateFrom)) return false
          if (f.startDateTo && (!startDate || startDate > f.startDateTo)) return false
          if (f.dueDateFrom && (!dueDate || dueDate < f.dueDateFrom)) return false
          if (f.dueDateTo && (!dueDate || dueDate > f.dueDateTo)) return false
          if (f.hasAttachments) {
            if (!Array.isArray(files) || files.length === 0) return false
          }
          if (sourceIds.size > 0) {
            if (!nodeId || !outgoingTargetIds.has(nodeId)) return false
          }
          return true
        }
        paths = paths.filter(p => matches(p))
      }
    }

    if (config.manualOrdering && config.orderedNodes.length > 0) {
      const setSel = new Set(paths)
      return config.orderedNodes.filter(p => setSel.has(p))
    }
    return paths.sort()
  }, [config.selectedNodes, config.manualOrdering, config.orderedNodes, nodeMap, config.filters])

  // Enforce limits
  const limitedPaths = useMemo(() => {
    const cap = isElectron ? Number.MAX_SAFE_INTEGER : 50
    const limit = Math.min(config.maxNodes, cap)
    return scopePaths.slice(0, limit)
  }, [scopePaths, config.maxNodes])

  const { series, xDomain, yDomain } = useMemo(() => {
    const xPositions = new Map<string, number>()
    const pointsBySeries: Record<string, Series> = {}
    const yVals: number[] = []

    // Build x positions
    const effectiveXType: 'string' | 'number' = config.manualOrdering ? 'string' : config.xType
    if (effectiveXType === 'number' && config.xVar) {
      // numeric: project positions by value; we still need domain
      const values: number[] = []
      for (const p of limitedPaths) {
        const n = nodeMap.get(p)
        const v = n ? (n.metadata as any)?.[config.xVar] : undefined
        if (typeof v === 'number') values.push(v)
      }
      const min = values.length ? Math.min(...values) : 0
      const max = values.length ? Math.max(...values) : 1
      for (const p of limitedPaths) {
        const n = nodeMap.get(p)
        const v = n ? (n.metadata as any)?.[config.xVar] : undefined
        if (typeof v === 'number') xPositions.set(p, v)
      }
      // prepare domain
      const xDomain: [number, number] = [min, max === min ? min + 1 : max]
      // y series
      for (const yv of config.yVars) {
        const s: Series = { name: yv.name, color: yv.color, points: [] }
        for (const p of limitedPaths) {
          const n = nodeMap.get(p)
          if (!n) continue
          const yVal = (n.metadata as any)?.[yv.name]
          const xVal = xPositions.get(p)
          if (typeof yVal === 'number' && typeof xVal === 'number') {
            s.points.push({ x: xVal, y: yVal, nodeId: p, title: n.metadata?.title || n.name })
            yVals.push(yVal)
          }
        }
        pointsBySeries[yv.name] = s
      }
      const yDomain: [number, number] = yVals.length ? [Math.min(...yVals), Math.max(...yVals)] : [0, 1]
      return { series: Object.values(pointsBySeries), xDomain, yDomain }
    }

    // string or default
    if (config.colocateRepeats && config.xVar) {
      const unique: string[] = []
      const indexOfVal = new Map<string, number>()
      for (const p of limitedPaths) {
        const n = nodeMap.get(p)
        const raw = n ? (n.metadata as any)?.[config.xVar] : undefined
        const key = String(raw ?? '')
        if (!indexOfVal.has(key)) {
          indexOfVal.set(key, unique.length)
          unique.push(key)
        }
        const idx = indexOfVal.get(key) as number
        xPositions.set(p, idx)
      }
      const xDomain: [number, number] = [0, Math.max(1, unique.length - 1)]
      for (const yv of config.yVars) {
        const s: Series = { name: yv.name, color: yv.color, points: [] }
        for (const p of limitedPaths) {
          const n = nodeMap.get(p)
          if (!n) continue
          const yVal = (n.metadata as any)?.[yv.name]
          const xVal = xPositions.get(p)
          if (typeof yVal === 'number' && typeof xVal === 'number') {
            s.points.push({ x: xVal, y: yVal, nodeId: p, title: n.metadata?.title || n.name })
            yVals.push(yVal)
          }
        }
        pointsBySeries[yv.name] = s
      }
      const yDomain: [number, number] = yVals.length ? [Math.min(...yVals), Math.max(...yVals)] : [0, 1]
      return { series: Object.values(pointsBySeries), xDomain, yDomain }
    }

    // equally spaced per node; if xVar provided, exclude nodes missing x value
    const usedPaths = config.xVar
      ? limitedPaths.filter(p => {
          const n = nodeMap.get(p)
          const v = n ? (n.metadata as any)?.[config.xVar] : undefined
          return typeof v === 'string' || typeof v === 'number'
        })
      : limitedPaths
    const xDomain: [number, number] = [0, Math.max(1, usedPaths.length - 1)]
    usedPaths.forEach((p, i) => { xPositions.set(p, i) })
    for (const yv of config.yVars) {
      const s: Series = { name: yv.name, color: yv.color, points: [] }
      for (const p of usedPaths) {
        const n = nodeMap.get(p)
        if (!n) continue
        const yVal = (n.metadata as any)?.[yv.name]
        const xVal = xPositions.get(p)
        if (typeof yVal === 'number' && typeof xVal === 'number') {
          s.points.push({ x: xVal, y: yVal, nodeId: p, title: n.metadata?.title || n.name })
          yVals.push(yVal)
        }
      }
      pointsBySeries[yv.name] = s
    }
    const yDomain: [number, number] = yVals.length ? [Math.min(...yVals), Math.max(...yVals)] : [0, 1]
    return { series: Object.values(pointsBySeries), xDomain, yDomain }
  }, [config.xVar, config.xType, config.yVars, config.colocateRepeats, limitedPaths, nodeMap, config.manualOrdering])

  const handleSavePNG = async () => {
    try {
      const el = containerRef.current
      if (!el) return
      // Render via SVG outerHTML to blob
      const svg = el.querySelector('svg') as SVGSVGElement | null
      if (!svg) return
      const xml = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      // Create canvas and draw
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image load failed'))
        img.src = url
      })
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(size.w * scale)
      canvas.height = Math.floor(size.h * scale)
      const ctx = canvas.getContext('2d')!
      if (config.background === 'white') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const pngBlob: Blob = await new Promise(res => canvas.toBlob(b => res(b as Blob), 'image/png'))
      if (isElectron && (window as any).electronAPI?.saveBinaryFile) {
        const buf = new Uint8Array(await pngBlob.arrayBuffer())
        await (window as any).electronAPI.saveBinaryFile(buf, 'progression.png')
      } else if (isElectron) {
        // Fallbacks: try writeFileBinary to a temp path via dialog:saveFile text fallback
        if ((window as any).electronAPI?.writeFileBinary) {
          const buf = new Uint8Array(await pngBlob.arrayBuffer())
          await (window as any).electronAPI.writeFileBinary('progression.png', buf)
        } else if ((window as any).electronAPI?.saveFile) {
          const b64 = await new Promise<string>(r => {
            const fr = new FileReader()
            fr.onload = () => r((fr.result as string).split(',')[1] || '')
            fr.readAsDataURL(pngBlob)
          })
          await (window as any).electronAPI.saveFile(b64)
        }
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(pngBlob)
        a.download = 'progression.png'
        a.click()
      }
      URL.revokeObjectURL(url)
    } catch (e) {
      // no-op
    }
  }

  const saveConfigToFile = async () => {
    const json = JSON.stringify(config, null, 2)
    if (isElectron && (window as any).electronAPI?.saveFile) {
      await (window as any).electronAPI.saveFile(json)
    } else {
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'progression-config.json'
      a.click()
    }
  }

  const onLoadConfig = async (file: File) => {
    try {
      const txt = await file.text()
      const parsed = JSON.parse(txt)
      setConfig(prev => ({ ...prev, ...parsed }))
    } catch {}
  }

  const xLabel = config.labelAxes ? (config.xVar || 'X') : undefined
  const yLabel = config.labelAxes ? (config.yVars.map(v => v.name).join(', ') || 'Y') : undefined

  return (
    <div className="h-full w-full flex">
      {/* Chart area on the left */}
      <div ref={containerRef} className="flex-1 p-2">
        <ProgressionChart
          width={size.w - 16}
          height={size.h - 16}
          series={series}
          xDomain={xDomain}
          yDomain={yDomain}
          xAxis={{ label: xLabel }}
          yAxis={{ label: yLabel }}
          showNodeTitles={config.showNodeTitles}
          showXAxisNodeTitles={config.showXAxisNodeTitles}
          background={'transparent'}
        />
      </div>
      {/* Controls on the right */}
      <div className="w-72 border-l border-border p-2 flex flex-col gap-2 overflow-y-auto">
        {/* Integrated sub-view switcher */}
        <div className="flex flex-col gap-2 items-stretch">
          <button className={clsx('px-2 py-1 text-sm', 'border rounded')} onClick={()=> onSwitchSubView?.('mindmap')}><span className="inline-flex items-center gap-1"><Network className="w-4 h-4"/>Mind Map</span></button>
          <button className={clsx('px-2 py-1 text-sm', 'border rounded')} onClick={()=> onSwitchSubView?.('outline')}><span className="inline-flex items-center gap-1"><ListTree className="w-4 h-4"/>Outline</span></button>
          <button className={clsx('px-2 py-1 text-sm', 'bg-accent rounded')} onClick={()=> onSwitchSubView?.('progression')} disabled><span className="inline-flex items-center gap-1"><LineChart className="w-4 h-4"/>Progression</span></button>
        </div>
        <div className="pt-1 border-t border-border" />
        <div className="grid grid-cols-4 gap-2 items-stretch">
          <button className="px-2 py-1 text-sm border rounded w-full" onClick={handleSavePNG}>Save Image</button>
          <button className="px-2 py-1 text-sm border rounded w-full" onClick={saveConfigToFile}>Save Config</button>
          <label className="px-2 py-1 text-sm border rounded cursor-pointer inline-flex items-center justify-center w-full text-center">
            <span className="w-full text-center">Load Config</span>
            <input type="file" accept="application/json" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) onLoadConfig(f) }} />
          </label>
          <button className="px-2 py-1 text-sm border rounded w-full" onClick={()=> setFiltersOpen(true)}>Filters</button>
        </div>
        <div className="pt-1 border-t border-border" />
        <label className="text-xs font-medium">X variable</label>
        <input className="px-2 py-1 border rounded bg-background" value={config.xVar} onChange={e=>setConfig(c=>({ ...c, xVar: e.target.value }))} placeholder="e.g. chapter" />
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={config.xType==='string'} onChange={()=>setConfig(c=>({ ...c, xType: 'string' }))} /> String
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={config.xType==='number'} onChange={()=>setConfig(c=>({ ...c, xType: 'number' }))} /> Number
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.colocateRepeats} onChange={e=>setConfig(c=>({ ...c, colocateRepeats: e.target.checked }))} /> Co-locate repeated X values
        </label>
        <div className="pt-1 border-t border-border" />
        <label className="text-xs font-medium">Y variables</label>
        {config.yVars.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className="flex-1 px-2 py-1 border rounded bg-background" value={v.name} onChange={e=>{
              const nv = [...config.yVars]; nv[i] = { ...nv[i], name: e.target.value }; setConfig(c=>({ ...c, yVars: nv }))
            }} placeholder="e.g. tension" />
            <input type="color" value={v.color} onChange={e=>{ const nv=[...config.yVars]; nv[i] = { ...nv[i], color: e.target.value }; setConfig(c=>({ ...c, yVars: nv })) }} />
            <button className="text-xs px-2 py-1 border rounded" onClick={()=>{ const nv=[...config.yVars]; nv.splice(i,1); setConfig(c=>({ ...c, yVars: nv })) }}>Remove</button>
          </div>
        ))}
        <button className="text-xs px-2 py-1 border rounded" onClick={()=> setConfig(c=>{
          const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f472b6','#f97316']
          const color = colors[Math.floor(Math.random()*colors.length)]
          return { ...c, yVars: [...c.yVars, { name: '', color }] }
        })}>Add Y variable</button>
        <div className="pt-1 border-t border-border" />
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={config.labelAxes} onChange={e=>setConfig(c=>({ ...c, labelAxes: e.target.checked }))}/> Label axes with variable names</label>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={config.showNodeTitles} onChange={e=>setConfig(c=>({ ...c, showNodeTitles: e.target.checked }))}/> Show node titles at points</label>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={config.showXAxisNodeTitles} onChange={e=>setConfig(c=>({ ...c, showXAxisNodeTitles: e.target.checked }))}/> Show node titles along X axis</label>
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={config.background!=='transparent'} onChange={e=>setConfig(c=>({ ...c, background: e.target.checked ? (typeof c.background==='string' && c.background!=='transparent' ? c.background : '#ffffff') : 'transparent' }))} />
            <span>Solid background (in exported image)</span>
          </label>
          {config.background !== 'transparent' && (
            <input type="color" value={typeof config.background==='string' ? config.background : '#ffffff'} onChange={e=> setConfig(c=>({ ...c, background: e.target.value || '#ffffff' }))} />
          )}
        </div>
        <div className="pt-1 border-t border-border" />
        <label className="text-xs font-medium">Max nodes</label>
        <input type="number" min={1} max={isElectron ? 9999 : 50} className="px-2 py-1 border rounded bg-background" value={config.maxNodes} onChange={e=> setConfig(c=>({ ...c, maxNodes: Math.max(1, Math.min((isElectron?9999:50), Number(e.target.value)||1)) }))} />
        {!isElectron && config.maxNodes > 50 && (
          <div className="text-[10px] text-destructive">Web cap is 50; performance may degrade.</div>
        )}
        <div className="pt-1 border-t border-border" />
        <button className="px-2 py-1 text-sm border rounded" onClick={()=> setAdvancedOpen(v=>!v)}>{advancedOpen? 'Hide':'Show'} Advanced</button>
        {advancedOpen && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="border border-border rounded">
              <NodeSelector
                selectedNodes={config.selectedNodes}
                onSelectionChange={(sel)=> setConfig(c=>({ ...c, selectedNodes: sel }))}
                showFolders={false}
                filters={config.filters}
                onFiltersChange={(f)=> setConfig(c=>({ ...c, filters: f }))}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={config.manualOrdering} onChange={e=> setConfig(c=>({ ...c, manualOrdering: e.target.checked }))}/> Use manual ordering</label>
            {config.manualOrdering && (
              <div className="border border-border rounded max-h-[60vh] flex flex-col">
                <NodeOrderingPanel
                  selectedNodes={config.selectedNodes}
                  onOrderChange={handleOrderChange}
                  onRemoveNodes={handleRemoveNodes}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {filtersOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setFiltersOpen(false)}>
          <div className="bg-background border border-border rounded-lg w-[640px] max-w-[95vw] p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button className="px-2 py-1 text-xs border rounded" onClick={()=> setConfig(c=>({ ...c, filters: { tags: [], tagsLogic: 'ANY', nameKeyword: '', descriptionKeyword: '', startsWith: '', endsWith: '', startsEndsCaseSensitive: false, startDateFrom: undefined, startDateTo: undefined, dueDateFrom: undefined, dueDateTo: undefined, hasAttachments: false, linkedFromNodeTags: [] } }))}>Clear</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-2">
                <label className="block text-xs font-medium">Tags (comma-separated)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={(config.filters?.tags || []).join(', ')} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{ tags: [], tagsLogic: 'ANY', nameKeyword: '', descriptionKeyword: '', startsWith: '', endsWith: '', startsEndsCaseSensitive: false, hasAttachments: false, linkedFromNodeTags: [] }), tags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) } }))} placeholder="e.g. design, api" />
                <label className="inline-flex items-center gap-2 text-xs mt-1">
                  <span>Match:</span>
                  <select className="px-2 py-1 border border-input rounded bg-background" value={config.filters?.tagsLogic || 'ANY'} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), tagsLogic: (e.target.value as any) } }))}>
                    <option value="ANY">ANY</option>
                    <option value="ALL">ALL</option>
                  </select>
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium">Keyword in name (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={config.filters?.nameKeyword || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), nameKeyword: e.target.value } }))} placeholder="case-insensitive" />
                <label className="block text-xs font-medium">Keyword in description</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={config.filters?.descriptionKeyword || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), descriptionKeyword: e.target.value } }))} placeholder="case-insensitive" />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium">Starts with (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={config.filters?.startsWith || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), startsWith: e.target.value } }))} />
                <label className="block text-xs font-medium">Ends with (title)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={config.filters?.endsWith || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), endsWith: e.target.value } }))} />
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" checked={config.filters?.startsEndsCaseSensitive || false} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), startsEndsCaseSensitive: e.target.checked } }))} />
                  Case sensitive
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium">Start date range (YYYY-MM-DD)</label>
                <div className="flex gap-2">
                  <input type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={config.filters?.startDateFrom || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), startDateFrom: e.target.value || undefined } }))} />
                  <input type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={config.filters?.startDateTo || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), startDateTo: e.target.value || undefined } }))} />
                </div>
                <label className="block text-xs font-medium">Due date range (YYYY-MM-DD)</label>
                <div className="flex gap-2">
                  <input type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={config.filters?.dueDateFrom || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), dueDateFrom: e.target.value || undefined } }))} />
                  <input type="date" className="px-2 py-1 border border-input rounded bg-background w-full" value={config.filters?.dueDateTo || ''} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), dueDateTo: e.target.value || undefined } }))} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs mt-5">
                  <input type="checkbox" className="rounded" checked={config.filters?.hasAttachments || false} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), hasAttachments: e.target.checked } }))} />
                  Has any file attachments
                </label>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="block text-xs font-medium">Linked from node(s) (node ID tags, comma-separated)</label>
                <input className="w-full px-2 py-1 border border-input rounded bg-background" value={(config.filters?.linkedFromNodeTags || []).join(', ')} onChange={(e)=> setConfig(c=>({ ...c, filters: { ...(c.filters||{} as any), linkedFromNodeTags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) } }))} placeholder="e.g. node-123, node-456" />
                <p className="text-[10px] text-muted-foreground">Includes nodes that are targets of the outgoing links from the specified node(s).</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="px-3 py-1.5 border rounded" onClick={()=> setFiltersOpen(false)}>Cancel</button>
              <button className="px-3 py-1.5 border rounded bg-primary text-primary-foreground" onClick={()=> setFiltersOpen(false)}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


