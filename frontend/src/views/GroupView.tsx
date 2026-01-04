import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTabStore } from '../store/tabStore'
import { useGroupViewStore } from '../store/groupViewState'
import { useNodeStore } from '../store/nodeStore'
import ReactFlow, { Background, Controls, Edge, Node, NodeTypes, Connection, useReactFlow } from 'react-flow-renderer'
import { buildEquivalenceBoxes, computeCoverRelations, computeRemainder } from '../utils/grouping'
import NodeContextMenu from '../components/graph/NodeContextMenu'
// @ts-ignore: type stub provided in global.d.ts; package installed at runtime
import * as htmlToImage from 'html-to-image'
import toast from 'react-hot-toast'
import GroupBoxNode from '../components/graph/GroupBoxNode'
import CustomNode from '../components/graph/CustomNode'

const groupNodeTypes: NodeTypes = { groupBox: GroupBoxNode, custom: CustomNode }

// Placeholder Group view. Will be replaced with React Flow Sub Flows implementation in subsequent tasks.
export default function GroupView() {
  const { currentProject } = useProjectStore()
  const activeTabId = useTabStore(s => s.activeTabId)
  const tabs = useTabStore(s => s.tabs)
  const loadFromStorage = useGroupViewStore(s => s.loadFromStorage)
  const saveToStorage = useGroupViewStore(s => s.saveToStorage)
  const groups = useGroupViewStore(s => s.groups)
  const options = useGroupViewStore(s => s.options)
  const layout = useGroupViewStore(s => s.layout)
  const setBoxLayout = useGroupViewStore(s => s.setBoxLayout)
  const { nodes: verbweaverNodes, deleteNode, createSoftLink, removeSoftLink } = useNodeStore()
  const { addEditorTab } = useTabStore()
  const flowWrapperRef = useRef<HTMLDivElement>(null)
  const { fitView, getViewport, setViewport } = useReactFlow()

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (currentProject?.id && graphTabId) {
      loadFromStorage(currentProject.id, graphTabId)
    }
  }, [currentProject?.id, activeTabId, tabs, loadFromStorage])

  // Debounced persistence when groups/options/layout change
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (!currentProject?.id || !graphTabId) return
    const h = window.setTimeout(() => {
      try { saveToStorage(currentProject.id!, graphTabId) } catch {}
    }, 400)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, options, layout])
  // Compute group node sets and equivalence boxes
  const equivalence = useMemo(() => {
    const enabled = groups.filter(g => g.enabled)
    if (enabled.length === 0) return { boxes: [], byId: new Map<string, { name: string }>() }
    const byId = new Map(enabled.map(g => [g.id, { name: g.name }]))
    const nodesArr = Array.from(verbweaverNodes.values() || [])

    const normalizeId = (s: string) => String(s || '').replace(/^node-/, '')
    const matches = (node: any, filters: any): boolean => {
      const meta = node?.metadata || {}
      const usingFilters = (
        (filters.tags || []).length > 0 || filters.nameKeyword || filters.descriptionKeyword || filters.startsWith || filters.endsWith ||
        filters.startDateFrom || filters.startDateTo || filters.dueDateFrom || filters.dueDateTo || filters.hasAttachments || (filters.linkedFromNodeTags || []).length > 0
      )
      if (!usingFilters) return true
      const title = String(meta?.title || node.name || '')
      const description = String(meta?.description || '')
      const tags: string[] = Array.isArray(meta?.tags) ? meta.tags.map(String) : []
      const startDate = String(meta?.task?.startDate || '')
      const dueDate = String(meta?.task?.dueDate || '')
      const files = Array.isArray(meta?.task?.files) ? meta.task.files : []
      const nodeId = String(meta?.id || '')
      if (filters.nameKeyword && !title.toLowerCase().includes(String(filters.nameKeyword).toLowerCase())) return false
      if (filters.descriptionKeyword && !description.toLowerCase().includes(String(filters.descriptionKeyword).toLowerCase())) return false
      if (filters.startsWith) {
        if (filters.startsEndsCaseSensitive) {
          if (!title.startsWith(filters.startsWith)) return false
        } else if (!title.toLowerCase().startsWith(String(filters.startsWith).toLowerCase())) return false
      }
      if (filters.endsWith) {
        if (filters.startsEndsCaseSensitive) {
          if (!title.endsWith(filters.endsWith)) return false
        } else if (!title.toLowerCase().endsWith(String(filters.endsWith).toLowerCase())) return false
      }
      if ((filters.tags || []).length > 0) {
        const set = new Set(tags.map((t: string) => t.toLowerCase()))
        const wanted = (filters.tags || []).map((t: string) => t.toLowerCase())
        if (filters.tagsLogic === 'ANY') {
          if (!wanted.some((t: string) => set.has(t))) return false
        } else if (!wanted.every((t: string) => set.has(t))) return false
      }
      if (filters.startDateFrom && (!startDate || startDate < filters.startDateFrom)) return false
      if (filters.startDateTo && (!startDate || startDate > filters.startDateTo)) return false
      if (filters.dueDateFrom && (!dueDate || dueDate < filters.dueDateFrom)) return false
      if (filters.dueDateTo && (!dueDate || dueDate > filters.dueDateTo)) return false
      if (filters.hasAttachments) {
        if (!Array.isArray(files) || files.length === 0) return false
      }
      if ((filters.linkedFromNodeTags || []).length > 0) {
        const sourceIds = new Set<string>((filters.linkedFromNodeTags || []).map(normalizeId).filter(Boolean))
        const outgoingTargetIds = new Set<string>()
        if (sourceIds.size > 0) {
          for (const n of verbweaverNodes.values()) {
            const nid = n?.metadata?.id
            if (nid && sourceIds.has(String(nid))) {
              const links: string[] = Array.isArray(n?.metadata?.links) ? n.metadata.links : []
              links.forEach((id: string) => { if (id) outgoingTargetIds.add(String(id)) })
            }
          }
        }
        if (!nodeId || !outgoingTargetIds.has(nodeId)) return false
      }
      return true
    }

    const groupNodes = enabled.map(g => ({
      groupId: g.id,
      nodeIds: nodesArr
        .filter(n => !n.isDirectory && matches(n, g.filters))
        .map(n => String(n?.metadata?.id || ''))
        .filter(Boolean),
    }))

    const boxes = buildEquivalenceBoxes(groupNodes)
    return { boxes, byId }
  }, [groups, verbweaverNodes])

  // Build maps for metadata lookup
  const idToMeta = useMemo(() => {
    const m = new Map<string, { title: string; links: string[] }>()
    for (const n of verbweaverNodes.values()) {
      const id = String(n?.metadata?.id || '')
      if (!id) continue
      m.set(id, { title: String(n?.metadata?.title || n?.name || id), links: Array.isArray(n?.metadata?.links) ? n?.metadata?.links.map(String) : [] })
    }
    return m
  }, [verbweaverNodes])
  const idToPath = useMemo(() => {
    const m = new Map<string, string>()
    for (const [path, n] of verbweaverNodes.entries()) {
      const id = String(n?.metadata?.id || '')
      if (!id) continue
      if (!m.has(id)) m.set(id, path)
    }
    return m
  }, [verbweaverNodes])

  // Build flow nodes and edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const boxIdToName = new Map<string, string>(
      equivalence.boxes.map(b => [b.boxId, b.groupIds.map(id => equivalence.byId.get(id)?.name || id).join(', ')])
    )
    const safeIdByBoxId = new Map<string, string>()
    equivalence.boxes.forEach((b, i) => {
      const sid = b.boxId && b.boxId.length > 0 ? b.boxId : `__empty__${i}`
      safeIdByBoxId.set(b.boxId, sid)
    })
    

    // Simple grid for initial positions if not saved
    const gridW = 260, gridH = 140, perRow = 3
    const covers = computeCoverRelations(equivalence.boxes)
    const parentsOf = new Map<string, Set<string>>()
    const childrenOf = new Map<string, Set<string>>()
    for (const e of covers) {
      if (!parentsOf.has(e.childBoxId)) parentsOf.set(e.childBoxId, new Set())
      parentsOf.get(e.childBoxId)!.add(e.parentBoxId)
      if (!childrenOf.has(e.parentBoxId)) childrenOf.set(e.parentBoxId, new Set())
      childrenOf.get(e.parentBoxId)!.add(e.childBoxId)
    }
    const topLevel = equivalence.boxes.filter(b => !(parentsOf.get(b.boxId)?.size))

    const chipsFor = (ids: string[]) => ids.map(id => ({ id, title: idToMeta.get(id)?.title || id }))
    const linkPairsFor = (ids: string[]) => {
      const idSet = new Set(ids)
      const pairs: Array<{ from: string; to: string }> = []
      ids.forEach(from => {
        const links = idToMeta.get(from)?.links || []
        links.forEach(to => { if (idSet.has(String(to))) pairs.push({ from, to: String(to) }) })
      })
      return pairs.slice(0, 12).map(p => ({ from: idToMeta.get(p.from)?.title || p.from, to: idToMeta.get(p.to)?.title || p.to }))
    }

    const maxCards = Math.max(5, Math.min(200, Number(options.maxCardsPerGroup || 40)))
    const showCap = options.showCapIndicator !== false
    if (!options.nestGroups) {
      equivalence.boxes.forEach((b, idx) => {
        const saved = layout.boxes[b.boxId]
        const x = saved?.x ?? (idx % perRow) * gridW
        const y = saved?.y ?? Math.floor(idx / perRow) * gridH
        const isEq = b.groupIds.length > 1
        const totalCount = b.nodeIds.length
        const boxWidth = options.showNodeCards ? 520 : 260
        const columns = options.showNodeCards ? (boxWidth >= 520 ? 3 : 2) : 0
        const estimateHeight = () => {
          if (!options.showNodeCards) return 160
          const rows = Math.ceil(Math.min(totalCount, maxCards) / columns)
          return 28 + rows * (80 + 12) + 24
        }
        const sid = safeIdByBoxId.get(b.boxId)!
        nodes.push({
          id: sid,
          data: { label: boxIdToName.get(b.boxId) || 'Group', isEquivalent: isEq, chips: chipsFor(b.nodeIds), linkPairs: linkPairsFor(b.nodeIds), showNodeCards: !!options.showNodeCards, visibleCardCount: Math.min(totalCount, maxCards), totalCardCount: totalCount, showCapIndicator: showCap },
          position: { x, y },
          style: { width: boxWidth, height: estimateHeight() },
          type: 'groupBox',
          draggable: true,
        })

        // Show full node cards inside group (flat mode: all nodes of the set)
        if (options.showNodeCards) {
          const childIds = b.nodeIds.slice(0, maxCards)
          const columns = (boxWidth >= 520 ? 3 : 2)
          const cardW = 180
          const cardH = 80
          const padX = 12, padY = 28
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = padX + col * (cardW + 12)
            const cy = padY + row * (cardH + 12)
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${sid}::n::${cid}`,
              parentNode: sid,
              position: { x: cx, y: cy },
              type: 'custom',
              draggable: false,
              data: {
                label: meta?.title || cid,
                type: String(storeNode?.metadata?.type || ''),
                metadata: storeNode?.metadata,
              },
              extent: 'parent' as any,
            } as any)
          })
          // Intra-group soft-link edges between child nodes
          const idSet = new Set(childIds)
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              if (idSet.has(String(to))) {
                edges.push({
                  id: `${sid}::e::${from}->${to}`,
                  source: `${sid}::n::${from}`,
                  target: `${sid}::n::${to}`,
                  type: 'default',
                  sourceHandle: 'right-source',
                  targetHandle: 'left-target',
                } as any)
              }
            })
          })
        }
      })
      // Flat mode: edges for superset/subset cover relations
      covers.forEach(e => {
        const ps = safeIdByBoxId.get(e.parentBoxId)!
        const cs = safeIdByBoxId.get(e.childBoxId)!
        if (ps && cs) edges.push({
          id: `${ps}->${cs}`,
          source: ps,
          target: cs,
          label: 'Contains',
          labelStyle: { fontSize: 11, fontWeight: 500, fill: 'hsl(var(--muted-foreground))' },
          labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 3,
        })
      })
    } else {
      // Nesting mode: recursively place children under each parent; duplicate children under multiple parents
      const placeBox = (
        boxId: string,
        parentSafeId?: string,
        depth: number = 0,
        idx: number = 0,
        forcedX?: number,
        forcedY?: number,
        forcedWidth?: number,
        forcedHeight?: number
      ) => {
        const b = equivalence.boxes.find(x => x.boxId === boxId)
        if (!b) return
        const safe = safeIdByBoxId.get(boxId)!
        const baseId = parentSafeId ? `${safe}__under__${parentSafeId}` : safe
        const saved = layout.boxes[baseId] || layout.boxes[safe] || layout.boxes[boxId]
        const x = parentSafeId ? (forcedX ?? 24) : (saved?.x ?? (idx % perRow) * gridW)
        const y = parentSafeId ? (forcedY ?? 32) : (saved?.y ?? Math.floor(idx / perRow) * gridH)
        const isEq = b.groupIds.length > 1

        // If nested, parent sees only remainder; the child shows its own chips
        const directChildren = Array.from(childrenOf.get(boxId) || [])
        const remainder = directChildren.length > 0 ? computeRemainder(b.nodeIds, directChildren.map(cid => {
          const cb = equivalence.boxes.find(x => x.boxId === cid)
          return cb ? cb.nodeIds : []
        })) : b.nodeIds
        const isRoot = !parentSafeId
        const displayedSet = isRoot ? remainder : b.nodeIds
        const totalCount = displayedSet.length

        // Sizes and padding for nested rendering
        const boxWidth = forcedWidth ?? (options.showNodeCards ? (parentSafeId ? 480 : 520) : (parentSafeId ? 240 : 260))
        const columns = options.showNodeCards ? (boxWidth >= 520 ? 3 : 2) : 1
        const cardW = 180
        const cardH = options.showNodeCards ? 80 : 48
        const padX = 16
        const padY = 16
        const remainderRows = Math.ceil(Math.min(displayedSet.length, maxCards) / columns)
        const remainderHeight = displayedSet.length === 0 ? 0 : remainderRows * (cardH + 12) + (displayedSet.length > 0 ? padY : 0)

        // Precompute child sizes to size parent tightly
        let childrenHeight = 0
        const childSizes: Array<{ id: string; w: number; h: number }> = []
        const childWidthBase = Math.max(200, boxWidth - 48)
        directChildren.forEach(cid => {
          const childBox = equivalence.boxes.find(x => x.boxId === cid)
          const childCount = childBox ? Math.min(childBox.nodeIds.length, maxCards) : 0
          const childCols = options.showNodeCards ? (childWidthBase >= 480 ? 3 : 2) : 1
          const childRows = childCols > 0 ? Math.ceil(childCount / childCols) : 0
          const childH = 24 + (childCount > 0 ? childRows * (cardH + 12) + padY : 0)
          const childW = Math.min(boxWidth - 32, options.showNodeCards ? Math.max(240, childWidthBase) : Math.max(200, childWidthBase))
          childSizes.push({ id: cid, w: childW, h: childH || (options.showNodeCards ? 120 : 80) })
          childrenHeight += (childH || (options.showNodeCards ? 120 : 80)) + 12
        })
        if (childrenHeight > 0) childrenHeight += padY

        const boxHeight = forcedHeight ?? (24 /*header*/ + remainderHeight + childrenHeight + padY)

        nodes.push({
          id: baseId,
          data: {
            label: boxIdToName.get(boxId) || 'Group',
            isEquivalent: isEq,
            chips: chipsFor(displayedSet),
            remainderChips: [],
            linkPairs: linkPairsFor(displayedSet),
            showNodeCards: !!options.showNodeCards,
            visibleCardCount: Math.min(totalCount, maxCards),
            totalCardCount: totalCount,
            showCapIndicator: showCap,
          },
          position: { x, y },
          style: { width: boxWidth, height: boxHeight },
          type: 'groupBox',
          draggable: !parentSafeId,
          parentNode: parentSafeId,
          extent: parentSafeId ? 'parent' : undefined,
        } as any)

        // In nested mode with node cards, render only remainder nodes inside the parent box;
        // child boxes will render their own nodes.
        if (options.showNodeCards) {
          const childIds = (isRoot ? remainder : b.nodeIds).slice(0, maxCards)
          const columns = (boxWidth >= 520 ? 3 : 2)
          const cardW = 180
          const cardH = 80
          const padX = 12, padY = 20
          childIds.forEach((cid, cidx) => {
            const col = cidx % columns
            const row = Math.floor(cidx / columns)
            const cx = padX + col * (cardW + 12)
            const cy = padY + row * (cardH + 12) + 24 // leave space for header
            const meta = idToMeta.get(cid)
            const path = idToPath.get(cid)
            const storeNode = path ? verbweaverNodes.get(path) : undefined
            nodes.push({
              id: `${baseId}::n::${cid}`,
              parentNode: baseId,
              position: { x: cx, y: cy },
              type: 'custom',
              draggable: false,
              data: {
                label: meta?.title || cid,
                type: String(storeNode?.metadata?.type || ''),
                metadata: storeNode?.metadata,
              },
              extent: 'parent' as any,
            } as any)
          })
          // Soft-link edges restricted to childIds within this base box
          const idSet = new Set(childIds)
          childIds.forEach(from => {
            const links = idToMeta.get(from)?.links || []
            links.forEach(to => {
              if (idSet.has(String(to))) {
                edges.push({
                  id: `${baseId}::e::${from}->${to}`,
                  source: `${baseId}::n::${from}`,
                  target: `${baseId}::n::${to}`,
                  type: 'default',
                  sourceHandle: 'right-source',
                  targetHandle: 'left-target',
                } as any)
              }
            })
          })
        }

        // Recurse children: duplicate under this baseId
        if (directChildren.length > 0) {
          let childY = 24 + remainderHeight + padY
          directChildren.forEach(cid => {
            const size = childSizes.find(s => s.id === cid)
            const cWidth = size?.w ?? Math.min(boxWidth - 32, options.showNodeCards ? 360 : 240)
            const cHeight = size?.h ?? (options.showNodeCards ? 140 : 100)
            const cx = Math.max(16, (boxWidth - cWidth) / 2)
            placeBox(cid, baseId, depth + 1, 0, cx, childY, cWidth, cHeight)
            childY += cHeight + 12
          })
        }
      }

      topLevel.forEach((b, idx) => placeBox(b.boxId, undefined, 0, idx))
    }

    return { flowNodes: nodes, flowEdges: edges }
  }, [equivalence, layout.boxes, options.nestGroups, options.showNodeCards, options.maxCardsPerGroup, options.showCapIndicator, idToMeta])

  const [optimisticEdges, setOptimisticEdges] = useState<Edge[]>([])
  const renderEdges = useMemo(() => {
    const nodeIds = new Set(flowNodes.map(n => n.id))
    const baseEdges = options.nestGroups
      ? flowEdges.filter(e => e.id.includes('::e::') || (String(e.source).includes('::n::') && String(e.target).includes('::n::')))
      : flowEdges
    const exist = new Set(baseEdges.map(e => e.id))
    const extras = optimisticEdges
      .filter(e => !exist.has(e.id))
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .filter(e => !options.nestGroups || e.id.includes('::e::') || (String(e.source).includes('::n::') && String(e.target).includes('::n::')))
    return [...baseEdges, ...extras]
  }, [flowEdges, optimisticEdges, flowNodes, options.nestGroups])

  // Clear optimistic edges when toggling nest mode to avoid stale group-to-group edges with missing handles
  useEffect(() => {
    setOptimisticEdges([])
  }, [options.nestGroups])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)

  // Clear optimistic edges that are now part of computed edges
  useEffect(() => {
    if (!optimisticEdges.length) return
    const exist = new Set(flowEdges.map(e => e.id))
    setOptimisticEdges(prev => prev.filter(e => !exist.has(e.id)))
  }, [flowEdges])

  const onNodeDragStop = useCallback((_: any, n: Node) => {
    if (!n?.id) return
    setBoxLayout(n.id, { x: n.position.x, y: n.position.y, w: n.width ?? undefined, h: n.height ?? undefined })
    const tab = tabs.find(t => t.id === activeTabId)
    const graphTabId = tab && tab.type === 'graph' ? tab.id : undefined
    if (currentProject?.id && graphTabId) {
      saveToStorage(currentProject.id, graphTabId)
    }
  }, [setBoxLayout, saveToStorage, tabs, activeTabId, currentProject?.id])

  const exportMapAsPng = useCallback(async () => {
    const toHide: HTMLElement[] = []
    const styled: Array<{ el: HTMLElement; prev: { color?: string; backgroundColor?: string; fill?: string; stroke?: string; strokeWidth?: string; attrStroke?: string | null; attrStrokeWidth?: string | null; attrFill?: string | null } }> = []
    const imageEvents: Array<{ src: string; ok: boolean; error?: any }> = []
    const originalImage = window.Image
    const scrubbedAttrs: Array<{ el: Element; name: string; prev: string }> = []
    let prevViewport: { x: number; y: number; zoom: number } | null = null
    try {
      // Patch Image to log every load/error that html-to-image triggers
      // so we can deterministically see failing resources.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.Image = class LoggingImage extends originalImage {
        constructor() {
          super()
          this.crossOrigin = 'anonymous'
          this.addEventListener('load', () => { imageEvents.push({ src: (this as any).src || '', ok: true }) })
          this.addEventListener('error', (err) => { imageEvents.push({ src: (this as any).src || '', ok: false, error: err }) })
        }
      } as typeof Image

      const wrapper = flowWrapperRef.current
      const flowRoot = (wrapper?.querySelector('.react-flow') as HTMLElement | null) || (wrapper?.querySelector('.react-flow__renderer') as HTMLElement | null)
      if (!flowRoot) {
        toast.error('Could not find the group canvas to export')
        return
      }

      // Collect all candidate resource URLs before capture to detect failures deterministically
      const collectResourceUrls = (root: HTMLElement) => {
        const urls = new Set<string>()
        root.querySelectorAll('img').forEach(img => { if (img.src) urls.add(img.src) })
        root.querySelectorAll<HTMLElement>('*').forEach(el => {
          const bg = getComputedStyle(el).backgroundImage || ''
          // Match url("...") occurrences; may return multiple
          const matches = Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))
          matches.forEach(m => { if (m[1]) urls.add(m[1]) })
        })
        return Array.from(urls)
      }

      const preflightResources = async (urls: string[]) => {
        const checks = urls.map(url => new Promise<{ url: string; ok: boolean; error?: any }>(resolve => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve({ url, ok: true })
          img.onerror = (err) => resolve({ url, ok: false, error: err })
          img.src = url
        }))
        return Promise.all(checks)
      }

      const resourceUrls = collectResourceUrls(flowRoot)
      console.log('[Group export] resources detected', resourceUrls)
      const preflight = await preflightResources(resourceUrls)
      const failed = preflight.filter(r => !r.ok)
      console.log('[Group export] preflight results', preflight)
      if (failed.length) {
        console.error('Group export preflight failed for URLs:', failed)
        toast.error('Failed to export map: resource could not be loaded')
        return
      }

      // Fit all nodes into view for export, then restore the viewport afterward
      prevViewport = getViewport ? getViewport() : null
      try {
        if (flowNodes.length > 0 && fitView) {
          await Promise.resolve(fitView({ includeHiddenNodes: true, padding: 0.2 }))
        }
      } catch (err) {
        console.error('Group export: fitView failed (continuing)', err)
      }

      wrapper?.querySelectorAll('.react-flow__attribution, .react-flow__controls, .vw-node-context-menu').forEach(el => {
        const h = el as HTMLElement
        if (h.style) { toHide.push(h); h.style.visibility = 'hidden' }
      })

      // Scrub invalid XML chars from attribute values to avoid parser errors in toSvg
      const invalidXmlChars = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD]/g
      const scrubElementAttributes = (el: Element) => {
        if (el.attributes) {
          Array.from(el.attributes).forEach(attr => {
            if (invalidXmlChars.test(attr.value)) {
              scrubbedAttrs.push({ el, name: attr.name, prev: attr.value })
              attr.value = attr.value.replace(invalidXmlChars, '')
            }
          })
        }
        Array.from(el.children || []).forEach(child => scrubElementAttributes(child))
      }
      scrubElementAttributes(flowRoot)

      // Inline edge stroke styles so edges render in exported image
      flowRoot.querySelectorAll('.react-flow__edge-path, .react-flow__connection-path').forEach(el => {
        try {
          const h = el as HTMLElement
          const cs = getComputedStyle(h)
          const prev = {
            stroke: (h.style as any).stroke,
            strokeWidth: (h.style as any).strokeWidth,
            fill: (h.style as any).fill,
            attrStroke: h.getAttribute('stroke'),
            attrStrokeWidth: h.getAttribute('stroke-width'),
            attrFill: h.getAttribute('fill'),
          }
          const stroke = cs.getPropertyValue('stroke') || '#9ca3af'
          const strokeWidth = cs.getPropertyValue('stroke-width') || '3'
          h.setAttribute('stroke', stroke)
          h.setAttribute('stroke-width', strokeWidth)
          h.setAttribute('fill', 'none')
          styled.push({ el: h, prev })
        } catch (err) {
          console.error('Group export: failed to inline edge stroke', err, { el })
        }
      })

      // Inline edge label colors to avoid missing computed styles in export
      flowRoot.querySelectorAll('.react-flow__edge-textbg').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { backgroundColor: h.style.backgroundColor, fill: (h.style as any).fill, stroke: (h.style as any).stroke }
        const fill = cs.fill || cs.backgroundColor
        const stroke = (cs as any).stroke || cs.borderColor
        if (fill) (h.style as any).fill = fill
        if (stroke) (h.style as any).stroke = stroke
        styled.push({ el: h, prev })
      })
      flowRoot.querySelectorAll('.react-flow__edge-text').forEach(el => {
        const h = el as HTMLElement
        const cs = getComputedStyle(h)
        const prev = { color: h.style.color, fill: (h.style as any).fill }
        const textFill = (cs as any).fill && (cs as any).fill !== 'none' ? (cs as any).fill : cs.color
        if (textFill) (h.style as any).fill = textFill
        h.style.color = textFill
        styled.push({ el: h, prev })
      })

      const root = getComputedStyle(document.documentElement)
      const bgVar = root.getPropertyValue('--background').trim()
      const bgColor = bgVar ? `hsl(${bgVar})` : getComputedStyle(document.body).backgroundColor || '#fff'
      const exportScale = 2 // upscale for crisper output

      // First generate SVG so we can inspect it deterministically
      const svgDataUrl = await htmlToImage.toSvg(flowRoot, {
        backgroundColor: bgColor,
        pixelRatio: exportScale,
        cacheBust: true,
        // useCORS is supported at runtime; cast to satisfy types
        useCORS: true,
        filter: (el: Element) => {
          const cls = (el as HTMLElement).classList
          if (!cls) return true
          return !cls.contains('react-flow__controls') && !cls.contains('react-flow__attribution') && !cls.contains('vw-node-context-menu')
        },
      } as any)

      let svgText = (() => {
        try {
          const comma = svgDataUrl.indexOf(',')
          return comma >= 0 ? decodeURIComponent(svgDataUrl.slice(comma + 1)) : ''
        } catch {
          return ''
        }
      })()
      console.log('[Group export] svg length', svgText?.length || 0)
      if (svgText) {
        console.log('[Group export] svg head', svgText.slice(0, 400))
        console.log('[Group export] svg tail', svgText.slice(-400))
      }

      // Validate SVG parse to surface syntax errors
      const parser = new DOMParser()
      const parsed = parser.parseFromString(svgText, 'image/svg+xml')
      let parseError = parsed.querySelector('parsererror')
      let parseErrorText: string | null = null
      if (parseError) {
        const msg = parseError.textContent || ''
        parseErrorText = msg
        const colMatch = msg.match(/column\s+(\d+)/i)
        const col = colMatch ? Number(colMatch[1]) : -1
        const charInfo = () => {
          if (col <= 0 || col > svgText.length) return null
          const idx = col - 1
          const ch = svgText[idx]
          const code = ch ? ch.charCodeAt(0) : -1
          return { idx, ch, code, context: svgText.slice(Math.max(0, idx - 40), Math.min(svgText.length, idx + 40)) }
        }
        console.error('Group export: SVG parsererror', msg, { column: col, charInfo: charInfo() })

        // Sanitize control characters not allowed in XML and retry
        const sanitized = svgText.replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD]/g, '')
        if (sanitized !== svgText) {
          const reparsed = parser.parseFromString(sanitized, 'image/svg+xml')
          const reparsedError = reparsed.querySelector('parsererror')
          if (!reparsedError) {
            console.warn('Group export: SVG sanitized to remove invalid chars before export')
            svgText = sanitized
            parseError = null
          } else {
            console.error('Group export: SVG still invalid after sanitize', reparsedError.textContent)
          }
        }
        if (parseError) {
          toast.error('Failed to export map: invalid SVG (see console)')
          return
        }
      }

      // Normalize to base64 data URL to eliminate encoding edge cases
      const svgBase64 = (() => {
        try {
          return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`
        } catch (err) {
          console.error('Group export: base64 encode failed', err)
          return svgDataUrl
        }
      })()

      // Manual image load to surface the exact error if decode fails
      const imgResult = await new Promise<{ ok: true; w: number; h: number } | { ok: false; error: any }>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = (err) => resolve({ ok: false, error: err })
        img.src = svgBase64
      })

      if (!imgResult.ok) {
        console.error('Group export: SVG image decode failed', imgResult, { svgSample: svgText?.slice(0, 500) })
        toast.error('Failed to export map: SVG decode error (see console)')
        return
      }

      // Draw to canvas manually to avoid hidden internals masking errors
      const canvas = document.createElement('canvas')
      canvas.width = imgResult.w * exportScale
      canvas.height = imgResult.h * exportScale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast.error('Failed to export map: no canvas context')
        return
      }
      // Paint background first for safety
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(exportScale, exportScale)
      ctx.drawImage(await (() => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = svgBase64
      }))(), 0, 0)

      const dataUrl = canvas.toDataURL('image/png')
      const filename = `groups-${new Date().toISOString().replace(/[:.]/g,'-')}.png`
      if (isElectron && (window as any).electronAPI?.saveBinaryFile) {
        const bin = await (await fetch(dataUrl)).arrayBuffer()
        const result = await (window as any).electronAPI.saveBinaryFile(new Uint8Array(bin), filename)
        if (!result?.canceled) toast.success('Map saved')
      } else {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        toast.success('Download started')
      }
      ;(window as any).__vw_groupExportDebug = {
        svgLength: svgText?.length || 0,
        svgSampleHead: svgText?.slice(0, 400),
        svgSampleTail: svgText?.slice(-400),
        resourceUrls,
        preflight,
        imageEvents,
        svgParseError: parseErrorText,
        svgDataUrl: svgDataUrl?.slice(0, 200) || '',
        svgBase64Prefix: svgBase64?.slice(0, 200) || '',
      }
    } catch (e) {
      console.error('Failed to export group map:', e, { imageEvents })
      const msg = e && (e as Error).message ? (e as Error).message : ''
      toast.error(`Failed to export map${msg ? `: ${msg}` : ''}`)
    } finally {
      try { window.Image = originalImage } catch {}
      try { console.log('[Group export] image load events', imageEvents) } catch {}
      try { toHide.forEach(h => { h.style.visibility = '' }) } catch {}
      try { scrubbedAttrs.forEach(s => { s.el.setAttribute(s.name, s.prev) }) } catch {}
      try {
        styled.forEach(s => {
          if (s.prev.color !== undefined) s.el.style.color = s.prev.color
          if (s.prev.backgroundColor !== undefined) s.el.style.backgroundColor = s.prev.backgroundColor
          if ((s.prev as any).fill !== undefined) (s.el.style as any).fill = (s.prev as any).fill
          if ((s.prev as any).stroke !== undefined) (s.el.style as any).stroke = (s.prev as any).stroke
          if ((s.prev as any).strokeWidth !== undefined) (s.el.style as any).strokeWidth = (s.prev as any).strokeWidth
          if ((s.prev as any).attrStroke !== undefined && (s.prev as any).attrStroke !== null) s.el.setAttribute('stroke', (s.prev as any).attrStroke)
          if ((s.prev as any).attrStrokeWidth !== undefined && (s.prev as any).attrStrokeWidth !== null) s.el.setAttribute('stroke-width', (s.prev as any).attrStrokeWidth)
          if ((s.prev as any).attrFill !== undefined && (s.prev as any).attrFill !== null) s.el.setAttribute('fill', (s.prev as any).attrFill)
        })
      } catch {}
      try {
        if (prevViewport && setViewport) {
          setViewport(prevViewport)
        }
      } catch {}
      setContextMenu(null)
    }
  }, [isElectron, flowNodes.length, fitView, getViewport, setViewport])

  const parseUnderlyingId = (nodeId: string): string | null => {
    const marker = '::n::'
    const idx = nodeId.indexOf(marker)
    if (idx === -1) return null
    return nodeId.slice(idx + marker.length)
  }

  const onNodeContextMenu = useCallback((e: any, n: Node) => {
    e.preventDefault()
    const underlying = parseUnderlyingId(n.id)
    if (!underlying) return // ignore group box context here; pane context handles export
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: underlying })
  }, [])

  const onEdgeContextMenu = useCallback((e: any, edge: Edge) => {
    e.preventDefault()
    // Only allow unlink for internal in-group edges with ::e:: pattern
    if (edge.id.includes('::e::')) {
      setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
    }
  }, [])

  const handleEditNode = useCallback((underlyingId?: string) => {
    if (!underlyingId) return
    const path = idToPath.get(underlyingId)
    const meta = Array.from(verbweaverNodes.values()).find(v => String(v?.metadata?.id || '') === underlyingId)
    if (path && meta) addEditorTab(path, meta.name)
  }, [idToPath, verbweaverNodes, addEditorTab])

  const handleDeleteNode = useCallback(async (underlyingId?: string) => {
    if (!underlyingId) return
    const path = idToPath.get(underlyingId)
    if (path) await deleteNode(path)
  }, [idToPath, deleteNode])

  const handleUnlinkEdge = useCallback(async (edgeId?: string) => {
    if (!edgeId) return
    // edge id format: <base>::e::<from>-><to>
    const marker = '::e::'
    const idx = edgeId.indexOf(marker)
    if (idx === -1) return
    const rest = edgeId.slice(idx + marker.length)
    const parts = rest.split('->')
    if (parts.length !== 2) return
    const from = parts[0]
    const to = parts[1]
    const fromPath = idToPath.get(from)
    const toPath = idToPath.get(to)
    if (fromPath && toPath) {
      await removeSoftLink(fromPath, toPath)
      setOptimisticEdges(prev => prev.filter(e => e.id !== edgeId))
    }
  }, [idToPath, removeSoftLink])

  const onConnect = useCallback(async (conn: Connection) => {
    const getUnderlying = (nid?: string | null) => (nid ? parseUnderlyingId(nid) : null)
    const s = getUnderlying(conn.source)
    const t = getUnderlying(conn.target)
    if (!s || !t) return
    const sp = idToPath.get(s)
    const tp = idToPath.get(t)
    if (sp && tp) {
      await createSoftLink(sp, tp)
      // Optimistic edge for in-group if both nodes share same base id prefix before '::n::'
      const base = (nid: string) => nid.split('::n::')[0]
      if (base(conn.source!) === base(conn.target!)) {
        const baseId = base(conn.source!)
        setOptimisticEdges(prev => ([...prev, {
          id: `${baseId}::e::${s}->${t}`,
          source: `${baseId}::n::${s}`,
          target: `${baseId}::n::${t}`,
          sourceHandle: conn.sourceHandle || 'right-source',
          targetHandle: conn.targetHandle || 'left-target',
        } as any]))
      }
    }
  }, [idToPath, createSoftLink])

  return (
    <div ref={flowWrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={renderEdges}
        nodeTypes={groupNodeTypes}
        onNodesChange={undefined as any}
        onEdgesChange={undefined as any}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onConnect={onConnect}
        onPaneContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        className="bg-background"
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          edgeId={contextMenu.edgeId}
          variant={!contextMenu.nodeId && !contextMenu.edgeId ? 'group-pane' : undefined}
          onCreateNode={() => {}}
          onDeleteNode={(nid) => { handleDeleteNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onEditNode={(nid) => { handleEditNode(nid || contextMenu.nodeId); setContextMenu(null) }}
          onUnlinkEdge={(eid) => { handleUnlinkEdge(eid || contextMenu.edgeId); setContextMenu(null) }}
          onClose={() => setContextMenu(null)}
          onExportMapAsPng={exportMapAsPng}
        />
      )}
    </div>
  )
}


